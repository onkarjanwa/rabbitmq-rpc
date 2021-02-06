Rabbitmq RPC
============

# RPC
- Please check [Remote Procedure Call](https://en.wikipedia.org/wiki/Remote_procedure_call)

# Rabbitmq
- [Rabbitmq.com](https://www.rabbitmq.com)

# Rabbitmq RPC
- I have implemented rabbitmq-rpc based on articles [Remote procedure call (RPC)](https://www.rabbitmq.com/tutorials/tutorial-six-python.html) and [Direct Reply-to](https://www.rabbitmq.com/direct-reply-to.html).

# Local setup
- Run rabbitmq using docker command `docker run -p 5672:5672 rabbitmq:3`.
- Run `npm install remote-procedure-call-rabbitmq`
- Done!

# Example for calling RPC Server
```
import * as amqp from 'amqplib';
import {RPCServer} from 'remote-procedure-call-rabbitmq';

function serviceFn(data: any): Promise<any> {
    console.log('serviceFn called')
    return new Promise((resolve, reject) => {
        resolve(data);
    });
}

const rpcServer = new RPCServer(amqp, {
    hostname: '127.0.0.1',
    port: 5672,
    username: 'guest',
    password: 'guest',
});
rpcServer.setDebug(true);
rpcServer.start().then(() => {
    rpcServer.provide('test', serviceFn);
}).catch(error => {
    console.log(error);
});
```

# Example for calling RPC Client
```
import * as amqp from 'amqplib';
import {RPCClient} from 'remote-procedure-call-rabbitmq';

const rpcClient = new RPCClient(amqp, {
    hostname: '127.0.0.1',
    port: 5672,
    username: 'guest',
    password: 'guest',
});
rpcClient.setDebug(true);
rpcClient.start().then(() => {
    rpcClient.call('test', {id: 1}).then(console.log).catch(console.log);
});
```
