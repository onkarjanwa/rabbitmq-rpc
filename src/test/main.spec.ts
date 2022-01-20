import {expect} from 'chai';
import sinon from 'sinon';

import { MockAmqp } from './mock-amqp';
import { RPCServer, RPCClient } from '../';

describe('RPC Server and Client Communication', () => {
    let sandbox: sinon.SinonSandbox;
    let rpcServer: any;
    let rpcClient: any;

    before(() => {
        sandbox = sinon.createSandbox();
    });

    beforeEach(async () => {
        rpcServer = new RPCServer(MockAmqp, {}, 'test_request');
        await rpcServer.start();
        rpcClient = new RPCClient(MockAmqp, {}, 'test_request', 'test_response');
        await rpcClient.start();
    });

    after(() => {
        sandbox.reset();
        sandbox.restore();
    });

    it('should be able to call a service registered by RPC server', async () => {
        // setup
        function serviceFn(data: any): Promise<any> {
            return new Promise((resolve, reject) => {
                resolve(data);
            });
        }

        const spyServiceFn = sandbox.spy(serviceFn);
        rpcServer.provide('test_service', spyServiceFn);

        // call
        await rpcServer.stop();
        await rpcClient.call('test_service', {id: 1});

        // verify
        sandbox.assert.calledOnce(spyServiceFn);
        sandbox.assert.calledWith(spyServiceFn, {id: 1});
    });

    it('should be able to call a service multiple times registered by RPC server', async () => {
        // setup
        function serviceFn(data: any): Promise<any> {
            return new Promise((resolve, reject) => {
                resolve(data);
            });
        }

        const spyServiceFn = sandbox.spy(serviceFn);
        rpcServer.provide('test_service', spyServiceFn);

        // call
        await rpcClient.call('test_service', {id: 1});
        await rpcClient.call('test_service', {id: 2});

        // verify
        sandbox.assert.calledTwice(spyServiceFn);
        expect(spyServiceFn.getCall(0).calledWith({id: 1})).to.be.true;
        expect(spyServiceFn.getCall(1).calledWith({id: 2})).to.be.true;
    });

    it('should be able to call a correct service incase multiple services registered by RPC server - 1', async () => {
        // setup
        function serviceFnA(data: any): Promise<any> {
            return new Promise((resolve, reject) => {
                resolve(data);
            });
        }

        function serviceFnB(data: any): Promise<any> {
            return new Promise((resolve, reject) => {
                resolve(data);
            });
        }

        const spyServiceFnA = sandbox.spy(serviceFnA);
        const spyServiceFnB = sandbox.spy(serviceFnB);
        rpcServer.provide('test_service_a', spyServiceFnA);
        rpcServer.provide('test_service_b', spyServiceFnB);

        // call
        await rpcClient.call('test_service_a', {id: 1});

        // verify
        sandbox.assert.calledOnce(spyServiceFnA);
        sandbox.assert.calledWith(spyServiceFnA, {id: 1});
        sandbox.assert.notCalled(spyServiceFnB);
    });



    it('should be able to call a correct service incase multiple services registered by RPC server - 2', async () => {
        // setup
        function serviceFnA(data: any): Promise<any> {
            return new Promise((resolve, reject) => {
                resolve(data);
            });
        }

        function serviceFnB(data: any): Promise<any> {
            return new Promise((resolve, reject) => {
                resolve(data);
            });
        }

        const spyServiceFnA = sandbox.spy(serviceFnA);
        const spyServiceFnB = sandbox.spy(serviceFnB);
        rpcServer.provide('test_service_a', spyServiceFnA);
        rpcServer.provide('test_service_b', spyServiceFnB);

        // call
        await rpcClient.call('test_service_a', {id: 1});
        await rpcClient.call('test_service_b', {id: 2});

        // verify
        sandbox.assert.calledOnce(spyServiceFnA);
        sandbox.assert.calledWith(spyServiceFnA, {id: 1});
        sandbox.assert.calledOnce(spyServiceFnB);
        sandbox.assert.calledWith(spyServiceFnB, {id: 2});
    });

    it('should not be able to call a service if not registered by RPC server', async () => {
        // setup
        function serviceFn(data: any): Promise<any> {
            return new Promise((resolve, reject) => {
                resolve(data);
            });
        }

        const spyServiceFn = sandbox.spy(serviceFn);
        rpcServer.provide('test_service', spyServiceFn);

        // call
        await rpcClient.call('test_service_not_registered', {id: 1});

        // verify
        sandbox.assert.notCalled(spyServiceFn);
    });

    it('should be able to receive response sent by a service registered by RPC server', async () => {
        // setup
        function serviceFn(data: any): Promise<any> {
            return new Promise((resolve, reject) => {
                resolve({id: 2});
            });
        }

        const spyServiceFn = sandbox.spy(serviceFn);
        rpcServer.provide('test_service', spyServiceFn);

        // call
        const response = await rpcClient.call('test_service', {id: 1});

        // verify
        sandbox.assert.calledOnce(spyServiceFn);
        sandbox.assert.calledWith(spyServiceFn, {id: 1});
        expect(response).to.be.an('object');
        expect(response).to.deep.equal({id: 2});
    });
});
