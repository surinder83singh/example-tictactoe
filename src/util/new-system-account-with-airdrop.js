// @flow

import {Account, Connection} from '@solana/web3.js';

/**
 * Create a new system account and airdrop it some lamports
 *
 * @private
 */
export async function newSystemAccountWithAirdrop(
  connection: Connection,
  lamports: number = 1,
): Promise<Account> {
  const account = new Account();
  console.log("xxxx1", account.publicKey, lamports)
  let sig = await connection.requestAirdrop(account.publicKey, lamports);
  console.log("xxxx22222")
  await connection.confirmTransaction(sig);
  return account;
}
