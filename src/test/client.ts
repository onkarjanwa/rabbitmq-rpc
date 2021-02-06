import * as amqp from 'amqplib';
import {RPCClient} from '..';

const rpcClient = new RPCClient(amqp, {});
rpcClient.setDebug(true);
rpcClient.start().then(() => {
    rpcClient.call('test', {id: 1}).then(console.log).catch(console.log);
});
