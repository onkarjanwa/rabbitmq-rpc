import * as amqp from 'amqplib';
import {v4} from 'uuid';
import {EventEmitter} from 'events';

import RPCConsoleLogger from './logger';
import {IRPCLogger, IRPCClient} from './types';

/**
 * @class RPCClient
 * Provides functionality for requesting RPCServer
 */
export class RPCClient implements IRPCClient {
    private amqp: any;
    private client: amqp.Connection;
    private config: amqp.Options.Connect;
    private isConnected: boolean = false;
    private channel: amqp.ConfirmChannel;
    private eventHandler: EventEmitter;
    private responseQueueName: string = 'rpc_response_queue';
    private requestQueueName: string = 'rpc_request_queue';
    private debug: boolean = false;
    private logger: IRPCLogger = new RPCConsoleLogger('RabbitMQ RPCClient');
    private channelRecoveryTryCount: number = 0;
    private readonly channelRecoveryMaxTryCount: number = 10;

    /**
     * RPCClient constructor
     * @param amqp amqp client lib
     * @param connectionConfig amqp connection config
     * @param requestQueueName Queue for requesting service call
     * @param responseQueueName Queue on which response will be received
     * @param logger logger lib
     */
    public constructor(amqp: any, connectionConfig: amqp.Options.Connect, requestQueueName?: string, responseQueueName?: string, logger?: IRPCLogger) {
        this.amqp = amqp;
        this.config = connectionConfig;
        if (requestQueueName) {
            this.requestQueueName = requestQueueName;
        }
        if (responseQueueName) {
            this.responseQueueName = responseQueueName;
        }

        if (logger) {
            this.logger = logger;
        }

        this.eventHandler = new EventEmitter();
        this.eventHandler.setMaxListeners(0);
    }

    /**
     * Enable logging information
     * @param debug boolean
     */
    public setDebug(debug: boolean) {
        this.debug = debug;
    }

    /**
     * Connect rpc client
     */
    public start(): Promise<void> {
        return this.connectIfNotConnected().then(() => {
            this.log('Connected to amqp server');
            return Promise.resolve();
        });
    }

    /**
     * Disconnect rpc client
     */
    public stop(): Promise<void> {
        return this.client.close().then(() => {
            this.isConnected = false;
            this.log('Connection closed to amqp server');
            return Promise.resolve();
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
                    this.logger.error(err);
                });
                this.client.on("close", () => {
                    this.isConnected = false;
                    this.log('connection closed');
                });
                process.once('SIGINT', this.client.close.bind(this.client));

                resolve();
            } catch (error) {
                this.logger.error(error);
                reject(error);
            }
        });
    }

    /**
     * Call a service provided by PRCServer
     * @param serviceName
     * @param data
     */
    public call<T>(
        serviceName: string,
        data: { [key: string]: any } = {}
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const correlationId = v4();
            this.eventHandler.once(correlationId, (response: any) => {
                this.log(`Service call completed - ${serviceName} for request -  ${correlationId}`);
                resolve(response);
            });

            this.connectIfNotConnected()
                .then(() => {
                    this.log(`Service call initiated - ${serviceName} for request - ${correlationId}`);
                    this.channel.sendToQueue(this.requestQueueName, Buffer.from(JSON.stringify({
                        action: serviceName,
                        data,
                    })), {
                        correlationId,
                        replyTo: this.responseQueueName,
                    }, (err: any) => {
                        if (err) {
                            this.logger.error(err);
                            throw err;
                        }
                    });
                })
                .catch(reject);
        });
    }

    private async setupChannel() {
        const channel = await this.client.createConfirmChannel();
        await channel.assertQueue(this.responseQueueName, {
            // Persistent messages and durable queues for a message to survive a server restart
            durable: true,
        });
        await channel.consume(this.responseQueueName, (message: amqp.ConsumeMessage | null) => {
            if (!message) {
                return;
            }

            const correlationId = message.properties.correlationId;
            const messageBody = JSON.parse(message.content.toString('utf8'));
            this.eventHandler.emit(correlationId, messageBody);
        }, {
            noAck: true,
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
