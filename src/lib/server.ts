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
     * Connect rpc server
     */
    public start(): Promise<void> {
        return this.connectIfNotConnected().then(() => {
            this.log('Connected to amqp server');
            return Promise.resolve();
        });
    }

    /**
     * Disconnect rpc server
     */
    public stop(): Promise<void> {
        return this.client.close().then(() => {
            this.isConnected = false;
            this.log('Connection closed to amqp server');
            return Promise.resolve();
        }).catch((error) => {
            console.log(error);
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
                    this.logger.error(err);
                });
                this.client.on("close", (error) => {
                    this.isConnected = false;
                    this.log('connection closed');
                    if (error) {
                        this.logger.error(error);
                    }

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
        const channel = await this.client.createChannel();
        await channel.assertQueue(this.requestQueueName, {
            // Persistent messages and durable queues for a message to survive a server restart
            durable: true,
        });
        await channel.consume(this.requestQueueName, (message: amqp.ConsumeMessage | null) => {
            if (!message) {
                return;
            }

            const messageData = JSON.parse(message.content.toString('utf8'));
            const responseQueueName = message.properties.replyTo;
            const correlationId = message.properties.correlationId;

            this.executeService(messageData.action, messageData.data)
                .then((result: any) => {
                    const response = result ? Buffer.from(JSON.stringify(result)) : Buffer.from(JSON.stringify({}));
                    channel.sendToQueue(
                        responseQueueName,
                        response,
                        {
                            correlationId,
                        },
                    );

                    return Promise.resolve();
                })
                .catch(error => {
                    this.logger.error(error);
                    channel.sendToQueue(
                        responseQueueName,
                        Buffer.from(JSON.stringify({})),
                        {
                            correlationId,
                        },
                    );
                })
                .then(() => {
                    if (message) {
                        channel.ack(message);
                    }
                });
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

    private executeService(serviceName: string, content: any): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const service = this.registeredServices.find(registeredService => registeredService.name === serviceName);
                if (!service) {
                    throw new Error(`No service found for: ${serviceName}`);
                }

                this.log(`Service call initiated: ${serviceName}`);

                service.fn(content)
                    .then((result: any) => {
                        this.log(`Service call completed: ${serviceName}`);
                        resolve(result);
                    })
                    .catch((err: Error) => {
                        throw err;
                    });
            } catch (error) {
                reject(error);
            }
        });
    }

    private connectIfNotConnected(): Promise<void> {
        if (!this.isConnected) {
            return this.connect();
        } else {
            return Promise.resolve();
        }
    }

    private log(message: string): void {
        if (this.debug) {
            this.logger.debug(message);
        }
    }
}
