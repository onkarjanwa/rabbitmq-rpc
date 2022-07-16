import * as amqp from 'amqplib';
import RPCConsoleLogger from '../logger';
import {RPCServer} from '..';

function serviceFn(data: any): Promise<any> {
    console.log('serviceFn called')
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve(data);
        }, 10000);
    });
}

const conf = {
    "client": {
        "protocol": "amqp",
        "hostname": "127.0.0.1",
        "port": 5677,
        "username": "guest",
        "password": "guest"
    },
    "server": {
        "protocol": "amqp",
        "hostname": "127.0.0.1",
        "port": 5677,
        "username": "guest",
        "password": "guest"
    }
};

(async () => {
    const rpcServer = new RPCServer(amqp, conf.server, 'rpc_request_queue_one', new RPCConsoleLogger('RabbitMQ RPCServer'));
    rpcServer.setDebug(true);
    // rpcServer.setChannelPrefetchCount(1);
    await rpcServer.start();
    rpcServer.provide('test', serviceFn);


    const rpcServerTwo = new RPCServer(amqp, conf.server, 'rpc_request_queue_two', new RPCConsoleLogger('RabbitMQ rpcServerTwo RPCServer'));
    rpcServerTwo.setDebug(true);
    // rpcServerTwo.setChannelPrefetchCount(1);
    await rpcServerTwo.start();
    rpcServerTwo.provide('test', serviceFn);
})();

// Not log in this case
// setTimeout(() => {
//     process.exit();
// }, 5000);
