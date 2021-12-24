// @flow

import {sendAndConfirmTransaction as realSendAndConfirmTransaction} from '@solana/web3.js';
import type {Account, Connection, Transaction} from '@solana/web3.js';
import YAML from 'json-to-pretty-yaml';

import {newSystemAccountWithAirdrop} from './new-system-account-with-airdrop';

type TransactionNotification = (string, string) => void;

let notify: TransactionNotification = () => undefined;

export function onTransaction(callback: TransactionNotification) {
  notify = callback;
}

let payerAccount: Account | null = null;
export async function sendAndConfirmTransaction(
  title: string,
  connection: Connection,
  transaction: Transaction,
  ...signers: Array<Account>
): Promise<void> {
  const when = Date.now();
  //console.log("eeee")
  const {feeCalculator} = await connection.getRecentBlockhash();
  //console.log("eeee2222")
  const high_lamport_watermark = feeCalculator.lamportsPerSignature * 100; // wag
  const low_lamport_watermark = feeCalculator.lamportsPerSignature * 10; // enough to cover any transaction
  
  if (!payerAccount) {
    //console.log("eeee33333")
    const newPayerAccount = await newSystemAccountWithAirdrop(
      connection,
      high_lamport_watermark,
    );
    //console.log("eeee4444")
    // eslint-disable-next-line require-atomic-updates
    payerAccount = payerAccount || newPayerAccount;
    console.log(title+":sendAndConfirmTransaction: creating new account", payerAccount.publicKey.toBase58())
  }
  //console.log("fffff")
  const payerBalance = await connection.getBalance(payerAccount.publicKey);
  // Top off payer if necessary
  if (payerBalance < low_lamport_watermark) {
    await connection.requestAirdrop(
      payerAccount.publicKey,
      high_lamport_watermark - payerBalance,
    );
  }

  
  //signers.unshift(payerAccount)

  let signature;
  try {
    signature = await realSendAndConfirmTransaction(
      connection,
      transaction,
      signers,
    );
  } catch (err) {
    console.log("signers", signers.map(a=>a.publicKey.toBase58()))
    // Transaction failed to confirm, it's possible the network restarted
    // eslint-disable-next-line require-atomic-updates
    payerAccount = null;
    throw err;
  }

  console.log("hhh")

  const body = {
    time: new Date(when).toString(),
    from: signers[0].publicKey.toBase58(),
    signature,
    instructions: transaction.instructions.map(i => {
      return {
        keys: i.keys.map(keyObj => keyObj.pubkey.toBase58()),
        programId: i.programId.toBase58(),
        data: '0x' + i.data.toString('hex'),
      };
    }),
  };

  notify(title, YAML.stringify(body).replace(/"/g, ''));
}
