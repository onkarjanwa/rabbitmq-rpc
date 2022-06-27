import * as amqp from 'amqplib';

import RPCConsoleLogger from './logger';
import {RPCServiceProviderFunction, IRPCLogger, IRPCServer} from './types';

/**
 * @class RPCServer
 * Provides functionality for responding to RPCClient
 */
export class RPCServer implements IRPCServer {
    private amqp: any;
    private client: amqp.Connection;
    private channel: amqp.Channel;
    private config: amqp.Options.Connect;
    private isConnected: boolean = false;
    private registeredServices: Array<{name: string, fn: Function}> = [];
    private requestQueueName: string = 'rpc_request_queue';
    private debug: boolean = false;
    private logger: IRPCLogger = new RPCConsoleLogger('RabbitMQ RPCServer');
    private channelRecoveryTryCount: number = 0;
    private readonly channelRecoveryMaxTryCount: number = 10;
    private readonly reconnectTimeInSeconds: number = 1;
    private reconnectEnable: boolean = true;
    private sendToQueueErrors: any = {};
    private channelSetupTS: number;
    private channelPrefetchCount: number;

    /**
     * RPCServer constructor
     * @param amqp amqp client lib
     * @param connectionConfig amqp connection config
     * @param requestQueueName Queue through which server will receive requests.
     * @param logger logger lib
     */
    public constructor(amqp: any, connectionConfig: amqp.Options.Connect, requestQueueName?: string, logger?: IRPCLogger) {
        this.amqp = amqp;
        this.config = connectionConfig;
        if (requestQueueName) {
            this.requestQueueName = requestQueueName;
        }

        if (logger) {
            this.logger = logger;
        }
    }

    /**
     * Enable logging information
     * @param debug boolean
     */
    public setDebug(debug: boolean) {
        this.debug = debug;
    }

    /**
     * Set channel prefetch count
     * Set 1 to enable synchronous operations
     * @param channelPrefetchCount
     */
    public setChannelPrefetchCount(channelPrefetchCount: number) {
        this.channelPrefetchCount = channelPrefetchCount;
    }

    /**
     * Connect rpc server
     */
    public start(): Promise<void> {
        return this.connectIfNotConnected(true).then(() => {
            this.log('Connected to amqp server');
            return Promise.resolve();
        });
    }

    /**
     * Disconnect rpc server
     */
    public stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.client.close().then(() => {
                this.isConnected = false;
                this.log('Connection closed to amqp server');
                return resolve();
            }).catch((error) => {
                this.logger.error(error);
                reject(error);
            });
        });
    }

    private connect(): Promise<void> {
        return new Promise(async (resolve: Function, reject: Function) => {
            try {
                this.client = await this.amqp.connect(this.config);
                await this.setupChannel();

                this.isConnected = true;

                // add event listeners
                this.client.on('blocked', (reason: string) => {
                    this.log(`connection blocked: ${reason}`);
                });
                this.client.on('unblocked', () => {
                    this.log('connection unblocked');
                });
                this.client.on("error", (err: Error) => {
                    // if this event was emitted, then the connection was already closed,
                    // so no need to call #close here
                    // also, 'close' is emitted after 'error',
                    // so no need for work already done in 'close' handler
                    this.logger.error('connection - on error', err);
                });
                this.client.on("close", (error) => {
                    this.isConnected = false;
                    this.log('connection closed');

                    // Retry connection if closed for any reason
                    // RPC Server connection can only be closed by shutting down the process
                    // otherwise it will retry connection
                    if (this.reconnectEnable) {
                        setTimeout(() => {
                            this.log('connection retry initiated');
                            this.connect().then(() => {
                                this.log('connection retry success');
                            }).catch((error) => {
                                this.logger.error(error)
                            });
                        }, this.reconnectTimeInSeconds * 1000);
                    }
                });

                //catches ctrl+c event
                process.once('SIGINT', () => {
                    this.reconnectEnable = false;
                    this.stop();
                });

                resolve();
            } catch (error) {
                this.logger.error(error);
                reject(error);
            }
        });
    }

    /**
     * Register a service that can be called by RPCClient
     * @param serviceName
     * @param fn
     */
    public provide<D, V>(
        serviceName: string,
        fn: RPCServiceProviderFunction<D, V>
    ): void {
        if (serviceName.trim().length === 0) {
            this.logger.error('Invalid Service Name');
            throw new Error('Invalid Service Name');
        }

        if (this.registeredServices.find(registeredService => registeredService.name === serviceName)) {
            this.logger.error(`Another service is already registered with provided name - ${serviceName}`);
            throw new Error(`Another service is already registered with provided name - ${serviceName}`);
        }

        this.registeredServices.push({
            name: serviceName,
            fn,
        });

        this.log(`Registered new service: ${serviceName}`);
    }

    private async setupChannel() {
        this.channelSetupTS = (new Date()).getTime();
        const channel = await this.client.createConfirmChannel();
        await channel.assertQueue(this.requestQueueName, {
            // Persistent messages and durable queues for a message to survive a server restart
            durable: true,
        });

        if (this.channelPrefetchCount) {
            await channel.prefetch(this.channelPrefetchCount);
        }

        await channel.consume(this.requestQueueName, (message: amqp.ConsumeMessage | null) => {
            if (!message) {
                return;
            }

            const messageData = JSON.parse(message.content.toString('utf8'));
            const responseQueueName = message.properties.replyTo;
            const correlationId = message.properties.correlationId;

            // check sendToQueue errors
            // send error message on channel to close communication
            const sendToQueueError = this.sendToQueueErrors[correlationId];
            if (sendToQueueError) {
                try {
                    channel.sendToQueue(
                        responseQueueName,
                        Buffer.from(JSON.stringify(sendToQueueError)),
                        {
                            correlationId,
                            type: 'error'
                        },
                        (error) => {
                            if (!error) {
                                delete this.sendToQueueErrors[correlationId];
                                channel.ack(message);
                            }
                        }
                    );
                } catch(error) {
                    this.logger.error('this.sendToQueueErrors -> channel.sendToQueue', error);
                }
            } else {
                this.executeService(messageData.action, correlationId, this.channelSetupTS, messageData.data)
                    .then(({channelSetupId, result}) => {
                        if (this.channelSetupTS === channelSetupId) {
                            try {
                                const response = result ? Buffer.from(JSON.stringify(result)) : Buffer.from(JSON.stringify({}));
                                channel.sendToQueue(
                                    responseQueueName,
                                    response,
                                    {
                                        correlationId,
                                    },
                                    (error) => {
                                        if (error) {
                                            this.sendToQueueErrors[correlationId] = error.message;
                                        } else {
                                            channel.ack(message);
                                            this.logger.info(`channel.sendToQueue - message ack`);
                                        }
                                    }
                                );
                            } catch(error) {
                                this.sendToQueueErrors[correlationId] = (error as Error).message;
                                this.logger.error('channel.sendToQueue', error);
                            }
                        }
                    })
                    .catch(({channelSetupId, error}) => {
                        this.logger.error('executeService', error);
                        if (this.channelSetupTS === channelSetupId) {
                            try {
                                channel.sendToQueue(
                                    responseQueueName,
                                    Buffer.from(JSON.stringify(error.message)),
                                    {
                                        correlationId,
                                        type: 'error'
                                    },
                                    (error) => {
                                        if (error) {
                                            this.sendToQueueErrors[correlationId] = error.message;
                                        } else {
                                            channel.ack(message);
                                            this.logger.info(`catch -> channel.sendToQueue - message ack`);
                                        }
                                    }
                                );
                            } catch(error) {
                                this.sendToQueueErrors[correlationId] = (error as Error).message;
                                this.logger.error('catch -> channel.sendToQueue', error);
                            }
                        }
                    });
            }
        });

        channel.on('closed', () => {
            this.log('channel - closed');
            this.channelRecoveryTryCount += 1;
            if (this.channelRecoveryTryCount <= this.channelRecoveryMaxTryCount) {
                this.setupChannel();
            } else {
                this.stop().then(this.start);
            }
        });

        this.channel = channel;
    }

    private executeService(serviceName: string, correlationId: string, channelSetupId: number, content: any): Promise<any> {
        return new Promise((resolve, reject) => {
            try {
                const service = this.registeredServices.find(registeredService => registeredService.name === serviceName);
                if (!service) {
                    throw new Error(`No service found for: ${serviceName}`);
                }

                this.log(`Service call initiated: ${serviceName} - ${correlationId}`);

                service.fn(content)
                    .then((result: any) => {
                        this.log(`Service call completed: ${serviceName} - ${correlationId}`);
                        resolve({
                            channelSetupId,
                            result,
                        });
                    })
                    .catch((err: Error) => {
                        throw err;
                    });
            } catch (error) {
                reject({
                    channelSetupId,
                    error,
                });
            }
        });
    }

    private connectIfNotConnected(retry: boolean = false): Promise<void> {
        if (!this.isConnected) {
            if (retry) {
                return this.retryConnect();
            } else {
                return this.connect();
            }
        }
        return Promise.resolve();
    }

    private async retryConnect(): Promise<void> {
        const {error} = await this.connect()
            .then(() => ({error: null}))
            .catch((e) => ({error: e}));

        if (error) {
            this.log('Retrying Rabbitmq connection');
            await this.wait(this.reconnectTimeInSeconds * 1000);
            await this.retryConnect();
        }
    }

    private wait(ms: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    private log(message: string): void {
        if (this.debug) {
            this.logger.debug(message);
        }
    }
}
