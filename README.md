Rabbitmq RPC
============

# RPC
- Please check [Remote Procedure Call](https://en.wikipedia.org/wiki/Remote_procedure_call)

# Rabbitmq
- [Rabbitmq.com](https://www.rabbitmq.com)

# Rabbitmq RPC
- I have implemented rabbitmq-rpc based on articles [Remote procedure call (RPC)](https://www.rabbitmq.com/tutorials/tutorial-six-python.html) and [Direct Reply-to](https://www.rabbitmq.com/direct-reply-to.html).

# Local setup
- Run rabbitmq using docker command `docker run --name rpc -p 5672:5672 rabbitmq:3`.
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

# Multiple consumer on one queue

# Todo 
1. Support for exchange [https://amqp-node.github.io/amqplib/channel_api.html#channel_assertExchange]
   This is required in case we want to run synchronous operations with heavy load. Using exchange we would be able to route messages of specific event or category to the specific server (consumer). That way we would be able to handle load of the server.

    The current implementation supports synchronous operations through one server (consumer) only.

2. Synchronous messaging to multiple servers

# Challenges
1. Synchronous operation through messaging on multiple servers
   1. Clients will have list of all the synchronous queue and will select only one for one type event / category operation that needs to be synchronous.
2. Multiple clients of one queue - How specific message will be delivered to the caller.
   1. By having a separate queue for each client.
