extern crate serde;
#[macro_use]
extern crate serde_derive;
extern crate solana_sdk;

mod dashboard;
mod error;
mod game;
mod program_command;
mod program_state;
mod simple_serde;

use crate::error::TicTacToeError;
use program_command::Command;
use program_state::State;
use simple_serde::SimpleSerde;
use solana_sdk::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    program_error::{PrintProgramError, ProgramError},
    pubkey::Pubkey,
    sysvar::{clock::Clock, Sysvar},
};
use solana_program::{msg, entrypoint};

fn fund_to_cover_rent(
    dashboard_account: &AccountInfo,
    account_to_fund: &AccountInfo,
) -> ProgramResult {
    static LOW_LAMPORT_WATERMARK: u64 = 300;
    if dashboard_account.lamports() <= 1 {
        msg!("Dashboard is out of lamports");
        return Err(ProgramError::InvalidArgument);
    }
    if account_to_fund.lamports() < LOW_LAMPORT_WATERMARK {
        msg!("Fund account");
        msg!(
            0,
            0,
            0,
            account_to_fund.lamports(),
            dashboard_account.lamports()
        );
        // Fund the player or game account with enough lamports to pay for rent
        let to_fund = LOW_LAMPORT_WATERMARK - account_to_fund.lamports();
        **account_to_fund.lamports.borrow_mut() += to_fund;
        **dashboard_account.lamports.borrow_mut() -= to_fund;
    }
    Ok(())
}

fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("tic-tac-toe Rust program entrypoint");

    if !accounts[0].is_signer {
        msg!("Account 0 did not sign the transaction");
        return Err(ProgramError::MissingRequiredSignature);
    }

    let command = Command::deserialize(instruction_data)?;
    let account_info_iter = &mut accounts.iter();

    if command == Command::InitDashboard {
        msg!("init dashboard");
        let dashboard_account = next_account_info(account_info_iter)?;

        let mut dashboard_state = State::deserialize(&dashboard_account.data.borrow())?;
        match dashboard_state {
            State::Uninitialized => dashboard_state = State::Dashboard(Default::default()),
            _ => {
                msg!("Invalid dashboard state for InitDashboard");
                return Err(ProgramError::InvalidArgument);
            }
        };

        dashboard_state.serialize(&mut dashboard_account.data.borrow_mut())?;
        return Ok(());
    }

    if command == Command::InitPlayer {
        msg!("init player");
        let dashboard_account = next_account_info(account_info_iter)?;
        let player_account = next_account_info(account_info_iter)?;
        match State::deserialize(&dashboard_account.data.borrow())? {
            State::Dashboard(_) => (),
            _ => {
                msg!("Invalid dashboard state");
                return Err(ProgramError::InvalidArgument);
            }
        };

        if dashboard_account.owner != player_account.owner || !player_account.data_is_empty() {
            msg!("Invalid player account1111");
            return Err(ProgramError::InvalidArgument);
        }

        return fund_to_cover_rent(dashboard_account, player_account);
    }

    let first_account = next_account_info(account_info_iter)?;
    let dashboard_account = next_account_info(account_info_iter)?;
    let mut dashboard_state = State::deserialize(&dashboard_account.data.borrow())?;
    match dashboard_state {
        State::Dashboard(_) => Ok(()),
        _ => {
            msg!("Invalid dashboard state");
            Err(ProgramError::InvalidArgument)
        }
    }?;

    if command == Command::InitGame {
        msg!("init game");
        let game_account = first_account;
        let player_account = next_account_info(account_info_iter)?;

        if game_account.owner != dashboard_account.owner {
            msg!("Invalid game account");
            return Err(ProgramError::InvalidArgument);
        }
        if game_account.owner != player_account.owner || !player_account.data_is_empty() {
            msg!("Invalid player account2222 {:?}!={:?}, is_empty{:?}", game_account.owner, player_account.owner, player_account.data_is_empty());
            return Err(ProgramError::InvalidArgument);
        }

        let mut game_state = State::deserialize(&game_account.data.borrow())?;
        match game_state {
            State::Uninitialized => {
                let game = game::Game::create(&player_account.key);
                match dashboard_state {
                    State::Dashboard(ref mut dashboard) => {
                        dashboard.update(&game_account.key, &game)?
                    }
                    _ => {
                        msg!("Invalid dashboard state");
                        return Err(ProgramError::InvalidArgument);
                    }
                }
                game_state = State::Game(game);
            }
            _ => {
                msg!("Invalid game state");
                return Err(ProgramError::InvalidArgument);
            }
        }

        dashboard_state.serialize(&mut dashboard_account.data.borrow_mut())?;
        game_state.serialize(&mut game_account.data.borrow_mut())?;
        fund_to_cover_rent(dashboard_account, game_account)?;
        return fund_to_cover_rent(dashboard_account, player_account);
    }

    let player_account = first_account;
    let game_account = next_account_info(account_info_iter)?;
    let sysvar_account = next_account_info(account_info_iter)?;

    if player_account.owner != dashboard_account.owner || !player_account.data_is_empty() {
        msg!("Invalid player account3333");
        return Err(ProgramError::InvalidArgument);
    }
    if dashboard_account.owner != game_account.owner {
        msg!("Invalid game account");
        return Err(ProgramError::InvalidArgument);
    }

    let mut game_state = State::deserialize(&game_account.data.borrow())?;
    match game_state {
        State::Game(ref mut game) => {
            let player = player_account.key;
            let current_slot = Clock::from_account_info(sysvar_account)?.slot;

            match command {
                Command::Advertise => {
                    // Nothing to do here beyond the dashboard_update() below
                    msg!("advertise game")
                }
                Command::Join => {
                    msg!("join game");
                    game.join(*player, current_slot)?
                }
                Command::Move(x, y) => {
                    msg!("move");
                    game.next_move(*player, x as usize, y as usize)?
                }
                Command::KeepAlive => {
                    msg!("keep alive");
                    game.keep_alive(*player, current_slot)?
                }
                _ => {
                    msg!("invalid command for State::Game");
                    return Err(ProgramError::InvalidArgument);
                }
            }

            match dashboard_state {
                State::Dashboard(ref mut dashboard) => {
                    dashboard.update(&game_account.key, &game)?
                }
                _ => {
                    msg!("Invalid dashboard state");
                    return Err(ProgramError::InvalidArgument);
                }
            }
        }
        _ => {
            msg!("Invalid game state}");
            return Err(ProgramError::InvalidArgument);
        }
    }

    dashboard_state.serialize(&mut dashboard_account.data.borrow_mut())?;
    game_state.serialize(&mut game_account.data.borrow_mut())?;
    fund_to_cover_rent(dashboard_account, game_account)?;
    fund_to_cover_rent(dashboard_account, player_account)
}

entrypoint!(_entrypoint);
fn _entrypoint(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    if let Err(error) = process_instruction(program_id, accounts, instruction_data) {
        // catch the error so we can print it
        error.print::<TicTacToeError>();
        return Err(error);
    }
    Ok(())
}
