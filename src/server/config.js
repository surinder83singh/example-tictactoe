// @flow

import {BpfLoader, Connection, Account, PublicKey, Keypair} from '@solana/web3.js';
import fs from 'mz/fs';
import path from 'path';
import semver from 'semver';

import {url, urlTls} from '../../url';
import {Store} from './store';
import {TicTacToeDashboard} from '../program/tic-tac-toe-dashboard';
import {newSystemAccountWithAirdrop} from '../util/new-system-account-with-airdrop';

const NUM_RETRIES = 500; /* allow some number of retries */

let connection;
let commitment;
let payer;
let GREETING_SIZE;

const PROGRAM_PATH = path.resolve(__dirname, '../../dist/program');
const PROGRAM_KEYPAIR_PATH = path.join(PROGRAM_PATH, 'tictactoe-keypair.json');

async function getConnection(): Promise<Object> {
  if (connection) return {connection, commitment};

  let newConnection = new Connection(url);
  const version = await newConnection.getVersion();

  // commitment params are only supported >= 0.21.0
  const solanaCoreVersion = version['solana-core'].split(' ')[0];
  if (semver.gte(solanaCoreVersion, '0.21.0')) {
    commitment = 'recent';
    newConnection = new Connection(url, commitment);
  }

  // eslint-disable-next-line require-atomic-updates
  connection = newConnection;
  console.log('Connection to cluster established:', url, version);
  return {connection, commitment};
}

/**
 * Obtain the Dashboard singleton object
 */
export async function findDashboard(): Promise<Object> {
  const store = new Store();
  const {connection, commitment} = await getConnection();
  const config = await store.load('../../../dist/config.json');
  const dashboard = await TicTacToeDashboard.connect(
    connection,
    new Account(Buffer.from(config.secretKey, 'hex')),
  );
  return {dashboard, connection, commitment};
}

/**
 * Load and parse the Solana CLI config file to determine which payer to use
 */
 export async function getPayer(): Promise<Keypair> {
  try {
    const config = await getConfig();
    if (!config.keypair_path) throw new Error('Missing keypair path');
    return await createKeypairFromFile(config.keypair_path);
  } catch (err) {
    console.warn(
      'Failed to create keypair from CLI config file, falling back to new random keypair',
    );
    return Keypair.generate();
  }
}

export async function establishPayer(): Promise<void> {
  let fees = 0;
  if (!payer) {
    const {feeCalculator} = await connection.getRecentBlockhash();

    let elf;
    try {
      elf = await fs.readFile(
        path.join(__dirname, '..', '..', 'dist', 'program', 'tictactoe.so'),
      );
    } catch (err) {
      console.error(err);
      process.exit(1);
      return;
    }

    const balanceNeeded =
      feeCalculator.lamportsPerSignature *
        (BpfLoader.getMinNumSignatures(elf.length) + NUM_RETRIES) +
      (await connection.getMinimumBalanceForRentExemption(elf.length));
    
    GREETING_SIZE = elf.length;

    // Calculate the cost to fund the greeter account
    fees += await connection.getMinimumBalanceForRentExemption(GREETING_SIZE);

    // Calculate the cost of sending transactions
    fees += feeCalculator.lamportsPerSignature * 100; // wag

    payer = await getPayer();
  }

  let lamports = await connection.getBalance(payer.publicKey);
  if (lamports < fees) {
    // If current balance is not enough to pay for fees, request an airdrop
    const sig = await connection.requestAirdrop(
      payer.publicKey,
      fees - lamports,
    );
    await connection.confirmTransaction(sig);
    lamports = await connection.getBalance(payer.publicKey);
  }

  console.log(
    'Using account',
    payer.publicKey.toBase58(),
    'containing',
    lamports / LAMPORTS_PER_SOL,
    'SOL to pay for fees',
    'LAMPORTS_PER_SOL:', LAMPORTS_PER_SOL
  );
}

export async function createKeypairFromFile(
  filePath: string,
): Promise<Keypair> {
  const secretKeyString = await fs.readFile(filePath, {encoding: 'utf8'});
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  return Keypair.fromSecretKey(secretKey);
}

/**
 * Load the TTT program and then create the Dashboard singleton object
 */
export async function createDashboard(): Promise<Object> {
  //await establishPayer();
  const store = new Store();
  const {connection, commitment} = await getConnection();

  /*
  // Derive the address (public key) of a greeting account from the program so that it's easy to find later.
  const GREETING_SEED = 'hello';
  greetedPubkey = await PublicKey.createWithSeed(
    payer.publicKey,
    GREETING_SEED,
    programId,
  );

  // Check if the greeting account has already been created
  const greetedAccount = await connection.getAccountInfo(greetedPubkey);
  if (greetedAccount === null) {
    console.log(
      'Creating account',
      greetedPubkey.toBase58(),
      'to say hello to',
    );
    const lamports = await connection.getMinimumBalanceForRentExemption(
      GREETING_SIZE,
    );

    const transaction = new Transaction().add(
      SystemProgram.createAccountWithSeed({
        fromPubkey: payer.publicKey,
        basePubkey: payer.publicKey,
        seed: GREETING_SEED,
        newAccountPubkey: greetedPubkey,
        lamports,
        space: GREETING_SIZE,
        programId,
      }),
    );
    await sendAndConfirmTransaction(connection, transaction, [payer]);
  }
  /*
  const loaderAccount = await newSystemAccountWithAirdrop(
    connection,
    balanceNeeded,
  );
  */

  //let program = new Account();
  /*
  let attempts = 5;
  while (attempts > 0) {
    try {
      console.log('Loading BPF program...');
      await BpfLoader.load(connection, loaderAccount, program, elf);
      break;
    } catch (err) {
      program = new Account();
      attempts--;
      console.log(
        `Error loading BPF program, ${attempts} attempts remaining:`,
        err.message,
      );
    }
  }

  if (attempts === 0) {
    throw new Error('Unable to load program');
  }
  */

  // Read program id from keypair file
  let programId;
  try {
    const programKeypair = await createKeypairFromFile(PROGRAM_KEYPAIR_PATH);
    programId = programKeypair.publicKey;
  } catch (err) {
    const errMsg = (err).message;
    throw new Error(
      `Failed to read program keypair at '${PROGRAM_KEYPAIR_PATH}' due to error: ${errMsg}. Program may need to be deployed with \`solana program deploy dist/program/helloworld.so\``,
    );
  }

  //programId = new PublicKey('GZPhfEcYRsKEw1VWVzNMt24cYa6qcb9NzZ8hRoJpNjQ7') //;program.publicKey;
  console.log('Creating dashboard for programId:', programId.toString());
  const dashboard = await TicTacToeDashboard.create(connection, programId);
  console.log('Creating dashboard for programId111:', programId.toString());
  await store.save('../../../dist/config.json', {
    url: urlTls,
    commitment,
    secretKey: Buffer.from(dashboard._dashboardAccount.secretKey).toString(
      'hex',
    ),
  });
  return {dashboard, connection, commitment};
}

/**
 * Used when invoking from the command line. First checks for existing dashboard,
 * if that fails, attempts to create a new one.
 */
export async function fetchDashboard(): Promise<Object> {
  try {
    let ret = await findDashboard();
    console.log('Dashboard:', ret.dashboard.publicKey.toBase58());
    return ret;
  } catch (err) {
    // ignore error, try to create instead
  }

  try {
    console.log("createDashboard.....")
    let ret = await createDashboard();
    console.log('Dashboard:', ret.dashboard.publicKey.toBase58());
    return ret;
  } catch (err) {
    console.error('Failed to create dashboard: ', err);
    throw err;
  }
}

if (require.main === module) {
  fetchDashboard()
    .then(process.exit)
    .catch(console.error)
    .then(() => 1)
    .then(process.exit);
}
