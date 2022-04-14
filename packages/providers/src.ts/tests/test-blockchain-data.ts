import assert from "assert";

import { retryIt, stats  } from "./utils.js";

import { providerNames, getProvider } from "./create-provider.js";

import { BlockchainData } from "./blockchain-data.js";
import type {
    TestCaseBlockchainBlock,
    TestCaseBlockchainLog,
    TestCaseBlockchainTransaction,
    TestCaseBlockchainReceipt,
} from "./blockchain-data.js";


function sumhash(hash: string): string {
    return `${ hash.substring(0, 6) }..${ hash.substring(hash.length - 4) }`;
}

function checkBlock(actual: any, test: TestCaseBlockchainBlock): void {
    assert.equal(actual.hash, test.hash, "hash");
    assert.equal(actual.parentHash, test.parentHash, "parentHash");
    assert.equal(actual.number, test.number, "number");
    assert.equal(actual.timestamp, test.timestamp, "timestamp");
    assert.equal(actual.nonce, test.nonce, "nonce");
    assert.equal(actual.difficulty, test.difficulty, "difficulty");
    assert.equal(actual.gasLimit, test.gasLimit, "gasLimit");
    assert.equal(actual.gasUsed, test.gasUsed, "gasUsed");
    assert.equal(actual.miner, test.miner, "miner");
    assert.equal(actual.extraData, test.extraData, "extraData");

    if (test.baseFeePerGas != null) {
        assert.equal(actual.baseFeePerGas, test.baseFeePerGas, "baseFeePerGas");
    }

    assert.ok(!!actual.transactions, "hasTxs");
    assert.equal(actual.transactions.length, test.transactions.length, "txs.length");
    for (let i = 0; i < actual.transactions.length; i++) {
        const atx = actual.transactions[i];
        const ttx = test.transactions[i];
        assert.equal(atx, ttx, `txs[${ i }]`);
    }
}

function checkTransaction(actual: any, test: TestCaseBlockchainTransaction): void {
    assert.equal(actual.hash, test.hash, "hash");
    assert.equal(actual.blockHash, test.blockHash, "blockHash");
    assert.equal(actual.blockNumber, test.blockNumber, "blockNumber");
    assert.equal(actual.type, test.type, "type");
    assert.equal(actual.index, test.index, "index");
    assert.equal(actual.from, test.from, "from");
    assert.equal(actual.to, test.to, "to");

    assert.equal(actual.gasLimit, test.gasLimit, "gasLimit");

    assert.equal(actual.gasPrice, test.gasPrice, "gasPrice");
    if (test.type === 2) {
        assert.equal(actual.maxFeePerGas, test.maxFeePerGas, "maxFeePerGas");
        assert.equal(actual.maxPriorityFeePerGas, test.maxPriorityFeePerGas, "maxPriorityFeePerGas");
    } else {
        assert.equal(actual.maxFeePerGas, null, "maxFeePerGas:null");
        assert.equal(actual.maxPriorityFeePerGas, null, "maxPriorityFeePerGas:null");
    }

    assert.equal(actual.value, test.value, "value");
    assert.equal(actual.nonce, test.nonce, "nonce");
    assert.equal(actual.data, test.data, "data");

    assert.equal(actual.creates, test.creates, "creates");
    assert.equal(actual.signature.r, test.signature.r, "signature.r");
    assert.equal(actual.signature.s, test.signature.s, "signature.s");
    assert.equal(actual.signature.networkV, test.signature.v, "signature.v");
}

function checkLog(actual: any, test: TestCaseBlockchainLog): void {
    assert.equal(actual.address, test.address, "address");
    assert.equal(actual.blockHash, test.blockHash, "blockHash");
    assert.equal(actual.blockNumber, test.blockNumber, "blockNumber");
    assert.equal(actual.data, test.data, "data");
    assert.equal(actual.index, test.index, "logIndex");
    assert.equal(actual.topics.join(","), test.topics.join(","), "topics");
    assert.equal(actual.transactionHash, test.transactionHash, "transactionHash");
    assert.equal(actual.transactionIndex, test.transactionIndex, "transactionIndex");
}

function checkTransactionReceipt(actual: any, test: TestCaseBlockchainReceipt): void {
    assert.equal(actual.hash, test.hash, "hash");
    assert.equal(actual.index, test.index, "index");

    assert.equal(actual.to, test.to, "to");
    assert.equal(actual.from, test.from, "from");
    assert.equal(actual.contractAddress, test.contractAddress, "contractAddress");

    assert.equal(actual.blockHash, test.blockHash, "blockHash");
    assert.equal(actual.blockNumber, test.blockNumber, "blockNumber");

    assert.equal(actual.logsBloom, test.logsBloom, "logsBloom");

    // @TODO: Logs
    assert.ok(actual.logs != null, "logs != null");
    assert.equal(actual.logs.length, test.logs.length, "logs.length");
    for (let i = 0; i < actual.logs.length; i++) {
        checkLog(actual.logs[i], test.logs[i]);
    }

    assert.equal(actual.gasUsed, test.gasUsed, "gasUsed");
    assert.equal(actual.cumulativeGasUsed, test.cumulativeGasUsed, "cumulativeGasUsed");
    assert.equal(actual.gasPrice, test.gasPrice, "gasPrice");

    // Some nodes add status to pre-byzantium nodes, so don't include it at all
    if (actual.status != null) {
        assert.equal(actual.status, test.status, `status: ${ actual.status } != ${ test.status }`);
    }

    // Some nodes dropped root, event on pre-byzantium blocks
    if (actual.root != null) {
        assert.equal(actual.root, test.root, `root ${ actual.root } != ${ test.root }`);
    }
}

function stall(duration: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, duration);
    });
}

describe("Test Provider Methods", function() {
    before(function() {
        stats.start("Test Provider Methods");
    });

    // Wait before each testcase so the backends don't throttle
    // use as much
    beforeEach(async function() {
        await stall(1000);
    });

    after(function() {
        stats.end();
    });

    // Etherscan does not support this
    const skipGetBlockByBlockHash = [ "EtherscanProvider" ];

    for (const providerName of providerNames) {
        for (const network in BlockchainData) {
            const provider = getProvider(providerName, network);
            if (provider == null || providerName === "CloudflareProvider") {
                console.log(`Skipping ${providerName}:${ network }...`);
                continue;
            }

            const tests = BlockchainData[network];
            for (const test of tests.addresses) {
                const address = test.address;

                if (test.balance != null) {
                    retryIt(`fetches address balance: ${ providerName }.${ network }.${ sumhash(address) }`, async function() {
                        assert.equal(await provider.getBalanceOf(address), test.balance, "balance");
                    });
                }

                if (test.code != null) {
                    retryIt(`fetches address code: ${ providerName }.${ network }.${ sumhash(address) }`, async function() {
                        assert.equal(await provider.getCode(address), test.code, "code");
                    });
                }

                if (test.name != null) {
                    retryIt(`fetches address reverse record: ${ providerName }.${ network }.${ sumhash(address) }`, async function() {
                        this.skip();
                        assert.equal(await provider.lookupAddress(address), test.name, "name");
                    });
                }

                if (test.storage != null) {
                    retryIt(`fetches address storage: ${ providerName }.${ network }.${ sumhash(address) }`, async function() {
                        for (const slot in test.storage) {
                            const value = test.storage[slot];
                            assert.equal(await provider.getStorageAt(address, slot), value, `storage:${ slot }`);
                        }
                    });
                }
            }

            for (const test of tests.blocks) {
                retryIt(`fetches block by number: ${ providerName }.${ network }.${ test.number }`, async function() {
                    checkBlock(await provider.getBlock(test.number), test);
                });

                if (skipGetBlockByBlockHash.indexOf(providerName) === -1) {
                    retryIt(`fetches block by hash: ${ providerName }.${ network }.${ sumhash(test.hash) }`, async function() {
                        checkBlock(await provider.getBlock(test.hash), test);
                    });

                } else {
                    retryIt(`throws unsupported operation for fetching block by hash: ${ providerName }.${ network }.${ sumhash(test.hash) }`, async function() {
                        await assert.rejects(
                            provider.getBlock(test.hash),
                            (error) => {
                                return (error.code === "UNSUPPORTED_OPERATION" &&
                                    error.operation === "getBlock(blockHash)");
                            }
                        );
                    });
                }
            }

            for (const test of tests.transactions) {
                retryIt(`fetches transaction: ${ providerName }.${ network }.${ sumhash(test.hash) }`, async function() {
                    checkTransaction(await provider.getTransaction(test.hash), test);
                });
            }

            for (const test of tests.receipts) {
                retryIt(`fetches transaction receipt: ${ providerName }.${ network }.${ sumhash(test.hash) }`, async function() {
                    checkTransactionReceipt(await provider.getTransactionReceipt(test.hash), test);
                });
            }
        }

        it(`fetches a pending block: ${ providerName }`, async function() {
            this.timeout(15000);

            const provider = getProvider(providerName, "homestead");
            assert.ok(provider, "provider");

            const block = await provider.getBlock("pending");
            assert.ok(!!block, "block");

            assert.equal(block.hash, null, "hash");
            assert.ok(typeof(block.number) === "number", "number");
            assert.ok(typeof(block.timestamp) === "number", "timestamp");
        });
    }

});
