import * as amqp from 'amqplib';
import {RPCServer} from '..';

function serviceFn(data: any): Promise<any> {
    console.log('serviceFn called')
    return new Promise((resolve, reject) => {
        resolve(data);
    });
}

const rpcServer = new RPCServer(amqp, {});
rpcServer.setDebug(true);
rpcServer.start().then(() => {
    rpcServer.provide('test', serviceFn);
}).catch(error => {
    console.log(error);
    console.log(error.code, error.message);
});

// Not log in this case
// setTimeout(() => {
//     process.exit();
// }, 5000);
