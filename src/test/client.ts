import * as amqp from 'amqplib';
import {RPCClient} from '..';

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
    const rpcClient = new RPCClient(amqp, conf.client, 'rpc_request_queue_one', 'rpc_response_queue_01');
    rpcClient.setDebug(true);
    await rpcClient.start();

    const rpcClientTwo = new RPCClient(amqp, conf.client, 'rpc_request_queue_two', 'rpc_response_queue_02');
    rpcClientTwo.setDebug(true);
    await rpcClientTwo.start();

    rpcClient.call('test', {id: 1}).then((v) => console.log(`1 - rpcClient - ${JSON.stringify(v)}`)).catch(console.log);
    rpcClientTwo.call('test', {id: 2}).then((v) => console.log(`2 - rpcClientTwo - ${JSON.stringify(v)}`)).catch(console.log);
    rpcClient.call('test', {id: 3}).then((v) => console.log(`3 - rpcClient - ${JSON.stringify(v)}`)).catch(console.log);
    rpcClientTwo.call('test', {id: 4}).then((v) => console.log(`4 - rpcClientTwo - ${JSON.stringify(v)}`)).catch(console.log);
})();
