use num_derive::FromPrimitive;
use num_traits::FromPrimitive;
use solana_program::{msg};
use solana_sdk::{
    program_error::{PrintProgramError, ProgramError},
    decode_error::DecodeError,
};
use thiserror::Error;

#[derive(Clone, Debug, Eq, Error, FromPrimitive, PartialEq)]
pub enum TicTacToeError {
    #[error("deserialization failed")]
    DeserializationFailed,
    #[error("game in progress")]
    GameInProgress,
    #[error("invalid move")]
    InvalidMove,
    #[error("invaid timestamp")]
    InvalidTimestamp,
    #[error("not your turn")]
    NotYourTurn,
    #[error("player not found")]
    PlayerNotFound,
}

impl From<TicTacToeError> for ProgramError {
    fn from(e: TicTacToeError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

impl<T> DecodeError<T> for TicTacToeError {
    fn type_of() -> &'static str {
        "TicTacToeError"
    }
}

impl PrintProgramError for TicTacToeError {
    fn print<E>(&self)
    where
        E: 'static + std::error::Error + DecodeError<E> + PrintProgramError + FromPrimitive,
    {
        match self {
            TicTacToeError::DeserializationFailed => msg!("Error: deserialization failed"),
            TicTacToeError::GameInProgress => msg!("Error: game in progress"),
            TicTacToeError::InvalidMove => msg!("Error: invalid move"),
            TicTacToeError::InvalidTimestamp => msg!("Error: invalid timestamp"),
            TicTacToeError::NotYourTurn => msg!("Error: not your turn"),
            TicTacToeError::PlayerNotFound => msg!("Error: player not found"),
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;

    fn return_tittactoe_error_as_program_error() -> ProgramError {
        TicTacToeError::PlayerNotFound.into()
    }

    #[test]
    fn test_print_error() {
        let error = return_tittactoe_error_as_program_error();
        error.print::<TicTacToeError>();
    }

    #[test]
    #[should_panic(expected = "CustomError(5)")]
    fn test_error_unwrap() {
        Err::<(), ProgramError>(return_tittactoe_error_as_program_error()).unwrap();
    }
}
