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
- Checkout the repository
- Run `npm install` and `npm build`
- Done!

# Local Testing
- Open Terminal and run `node dist/test/server/js`
- Open another Terminal and run `node dist/test/client.js`
- You can check the result on terminal that the rpc client is receiving response from rpc server.
