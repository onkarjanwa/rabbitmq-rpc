const queues: any = {};

class EventManager {
    on(eventName: string, callback: Function) {}

    emit(eventName: string) {}
}

class Channel extends EventManager {
    constructor() {
        super();
    }

    async assertQueue(name: string, options?: {}) {
        queues[name] = {
            options: options || {},
            consumerCallback: null,
        };
    }

    async consume(name: string, fn: Function) {
        queues[name].consumerCallback = fn;
    }

    sendToQueue(name: string, input: object, options: object, callback: Function) {
        try {
            let error: Error | null = null;
            const message = {
                content: input,
                properties: options,
            };
            if (queues[name]) {
                queues[name].consumerCallback(message);
            } else {
                error = new Error('no queue found');
            }

            if (callback) {
                callback(error, true);
            }
        } catch (error) {
            if (callback) {
                callback(error);
            }
        }
    }

    ack(message: string) {}
}

class AmqpConnection extends EventManager {
    async createChannel() {
        return new Channel();
    }

    async createConfirmChannel() {
        return new Channel();
    }

    close() {}
}

/**
 * Mock for amqplib
 */
export class MockAmqp {
    static async connect() {
        return new AmqpConnection();
    }
}
