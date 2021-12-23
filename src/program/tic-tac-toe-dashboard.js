/**
 *
 * The TicTacToe Dashboard class exported by this file is used to interact with the
 * on-chain tic-tac-toe dashboard program.
 *
 * @flow
 */

import invariant from 'assert';
import EventEmitter from 'event-emitter';
import {
  Account,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmRawTransaction,
  sendAndConfirmTransaction as realSendAndConfirmTransaction,
  TransactionInstruction,
  Keypair
} from '@solana/web3.js';
import {AccountInfo, Connection} from '@solana/web3.js';

import {newSystemAccountWithAirdrop} from '../util/new-system-account-with-airdrop';
import {sleep} from '../util/sleep';
import {sendAndConfirmTransaction} from '../util/send-and-confirm-transaction';
import * as ProgramCommand from './program-command';
import {deserializeDashboardState} from './program-state';
import type {DashboardState} from './program-state';
import {TicTacToe} from './tic-tac-toe';

let greetedPubkey;
let payer;
//let greetedAccount;
let GREETING_SIZE;

export class TicTacToeDashboard {
  state: DashboardState;
  connection: Connection;
  programId: PublicKey;
  publicKey: PublicKey;
  _dashboardAccount: Account;
  _ee: EventEmitter;
  _changeSubscriptionId: number | null;

  /**
   * @private
   */
  constructor(
    connection: Connection,
    programId: PublicKey,
    dashboardAccount: Account,
  ) {
    const {publicKey} = dashboardAccount;

    const state = {
      pendingGame: null,
      completedGames: [],
      totalGames: 0,
    };
    Object.assign(this, {
      connection,
      programId,
      _dashboardAccount: dashboardAccount,
      publicKey,
      state,
      _changeSubscriptionId: connection.onAccountChange(
        publicKey,
        this._onAccountChange.bind(this),
      ),
      _ee: new EventEmitter(),
    });
  }

  /**
   * Creates a new dashboard
   */
  static async create(
    connection: Connection,
    programId: PublicKey,
  ): Promise<TicTacToeDashboard> {
    const SizeOfDashBoardData = 255;
    GREETING_SIZE = 255;
    const {feeCalculator} = await connection.getRecentBlockhash();
    const lamports = 1000000000; // enough to cover rent for game and player accounts
    const balanceNeeded =
      feeCalculator.lamportsPerSignature * 3 /* payer + 2 signers */ +
      (await connection.getMinimumBalanceForRentExemption(SizeOfDashBoardData));
    payer = await newSystemAccountWithAirdrop(
      connection,
      lamports + balanceNeeded,
    );

    let dashboardAccount = Keypair.generate();

    
    const GREETING_SEED = 'hello';
    /*
    greetedPubkey = await PublicKey.createWithSeed(
      payer.publicKey,
      GREETING_SEED,
      programId,
    );
    */

    // Check if the greeting account has already been created
    //greetedAccount = await connection.getAccountInfo(greetedPubkey);
    //if (greetedAccount === null) {
      console.log(
        'Creating account',
        dashboardAccount.publicKey.toBase58(),
        'to say hello to',
      );
      /*
      const lamports = await connection.getMinimumBalanceForRentExemption(
        GREETING_SIZE,
      );
      */

      const transaction = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: payer.publicKey,
          //basePubkey: payer.publicKey,
          //seed: GREETING_SEED,
          newAccountPubkey: dashboardAccount.publicKey,
          lamports,
          space: SizeOfDashBoardData,
          programId,
        }),
      );
      console.log("ssssssss")
      await realSendAndConfirmTransaction(connection, transaction, [payer, dashboardAccount]);
      console.log("ssssssss 22222")
      //greetedAccount = await connection.getAccountInfo(greetedPubkey);
    //}

    return await this.initDashboard(connection, dashboardAccount, programId);
  }

  /**
 * Say hello
 */
   static async initDashboard(connection, dashboardAccount, programId): Promise<void> {
    /*
      console.log('Saying hello to', greetedPubkey.toBase58());
      const instruction = new TransactionInstruction({
        keys: [{pubkey: greetedPubkey, isSigner: false, isWritable: true}],
        programId,
        data: Buffer.alloc(0), // All instructions are hellos
      });
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(instruction),
        [payer],
      );
    */
    //const transaction = new Transaction();
    //transaction.add(createAccountTx)
    console.log("programId", programId, payer, dashboardAccount)
    const instruction = new TransactionInstruction({
      keys: [
        {pubkey: dashboardAccount.publicKey, isSigner: true, isWritable: true},
      ],
      programId,
      data: ProgramCommand.initDashboard(),
    });

    console.log("ccccc")
    await realSendAndConfirmTransaction(
      connection,
      new Transaction().add(instruction),
      [payer, dashboardAccount]
    );

    console.log("dddd")

    return new TicTacToeDashboard(connection, programId, dashboardAccount);
  }

  /**
   * Connects to an existing dashboard
   */
  static async connect(
    connection: Connection,
    dashboardAccount: Account,
  ): Promise<TicTacToeDashboard> {
    const accountInfo = await connection.getAccountInfo(
      dashboardAccount.publicKey,
    );
    if (accountInfo === null) {
      throw new Error('Failed to get dashboard account information');
    }
    const {owner} = accountInfo;

    const dashboard = new TicTacToeDashboard(
      connection,
      owner,
      dashboardAccount,
    );
    dashboard.state = deserializeDashboardState(accountInfo);
    return dashboard;
  }

  /**
   * @private
   */
  _onAccountChange(accountInfo: AccountInfo) {
    this.state = deserializeDashboardState(accountInfo);
    this._ee.emit('change');
  }

  /**
   * Register a callback for notification when the dashboard state changes
   */
  onChange(fn: Function) {
    this._ee.on('change', fn);
  }

  /**
   * Remove a previously registered onChange callback
   */
  removeChangeListener(fn: Function) {
    this._ee.off('change', fn);
  }

  /**
   * Request a partially signed Transaction that will enable the player to
   * initiate a Game.
   *
   * Note: Although the current implementation of this method is inline, in
   * production this function would issue an RPC request to a server somewhere
   * that hosts the dashboard's secret key.
   *
   * Upon return, the player must sign the Transaction with their secretKey and
   * send it to the cluster.
   */
  async _requestPlayerAccountTransaction(
    playerPublicKey: PublicKey,
  ): Promise<Transaction> {
    const {
      blockhash: recentBlockhash,
      feeCalculator,
    } = await this.connection.getRecentBlockhash();

    const accountStorageOverhead = 128;
    const balanceNeeded =
      feeCalculator.lamportsPerSignature * 3 /* payer + 2 signer keys */ +
      (await this.connection.getMinimumBalanceForRentExemption(
        accountStorageOverhead,
      ));
    const payerAccount = await newSystemAccountWithAirdrop(
      this.connection,
      balanceNeeded,
    );


    let transaction = new Transaction({
      feePayer:payerAccount.publicKey,
      recentBlockhash
    });

    console.log("this._dashboardAccount.publicKey", this._dashboardAccount.publicKey)
    console.log("ssssss:", playerPublicKey, this.programId)
    transaction.add(
      SystemProgram.assign({
        accountPubkey: playerPublicKey,
        programId: this.programId,
      })
    )
    transaction.add(
      new TransactionInstruction({
        keys: [
          {
            pubkey: this._dashboardAccount.publicKey,
            isSigner: true,
            isWritable: true,
          },
          {pubkey: playerPublicKey, isSigner: true, isWritable: true},
        ],
        programId: this.programId,
        data: ProgramCommand.initPlayer(),
      }),
    );
    
    transaction.partialSign(
      payerAccount,
      this._dashboardAccount
    );
    return transaction;
  }

  /**
   * Finds another player and starts a game
   */
  async startGame(): Promise<TicTacToe> {
    const playerAccount = new Account();
    const transaction = await this._requestPlayerAccountTransaction(
      playerAccount.publicKey,
    );
    transaction.partialSign(playerAccount);
    await sendAndConfirmRawTransaction(
      this.connection,
      transaction.serialize(),
    );

    let myGame: TicTacToe | null = null;

    // Look for pending games from others, while trying to advertise our game.
    for (;;) {
      if (myGame) {
        if (myGame.inProgress) {
          // Another player joined our game
          console.log(
            `Another player accepted our game (${myGame.gamePublicKey.toString()})`,
          );
          return myGame;
        }

        if (myGame.disconnected) {
          throw new Error('game disconnected');
        }
      }

      const pendingGamePublicKey = this.state.pendingGame;

      if (
        pendingGamePublicKey !== null &&
        (!myGame || !myGame.gamePublicKey.equals(pendingGamePublicKey))
      ) {
        try {
          console.log(`Trying to join ${pendingGamePublicKey.toString()}`);
          const theirGame = await TicTacToe.join(
            this.connection,
            this.programId,
            this.publicKey,
            playerAccount,
            pendingGamePublicKey,
          );
          if (theirGame !== null) {
            console.log(`Joined game ${theirGame.gamePublicKey.toString()}`);
            if (myGame) {
              myGame.abandon();
            }
            return theirGame;
          }
        } catch (err) {
          console.log(err.message);
        }
      }

      if (!myGame) {
        myGame = await TicTacToe.create(
          this.connection,
          this.programId,
          this.publicKey,
          playerAccount,
        );
      }

      if (
        pendingGamePublicKey === null ||
        !myGame.gamePublicKey.equals(pendingGamePublicKey)
      ) {
        // Advertise myGame as the pending game for others to see and join
        console.log(
          `Advertising our game (${myGame.gamePublicKey.toString()})`,
        );
        const transaction = new Transaction().add({
          keys: [
            {
              pubkey: playerAccount.publicKey,
              isSigner: true,
              isWritable: true,
            },
            {pubkey: this.publicKey, isSigner: false, isWritable: true},
            {pubkey: myGame.gamePublicKey, isSigner: false, isWritable: true},
            {
              pubkey: ProgramCommand.getSysvarClockPublicKey(),
              isSigner: false,
              isWritable: false,
            },
          ],
          programId: this.programId,
          data: ProgramCommand.advertiseGame(),
        });
        await sendAndConfirmTransaction(
          'advertiseGame',
          this.connection,
          transaction,
          playerAccount,
        );
      }

      // Wait for a bite
      await sleep(500);
    }
    invariant(false); //eslint-disable-line no-unreachable
  }

  async disconnect() {
    const {_changeSubscriptionId} = this;
    if (_changeSubscriptionId !== null) {
      this._changeSubscriptionId = null;
      try {
        await this.connection.removeAccountChangeListener(
          _changeSubscriptionId,
        );
      } catch (err) {
        console.error('Failed to remove account change listener', err);
      }
    }
  }
}
