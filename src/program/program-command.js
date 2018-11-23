/**
 * The commands (encoded as Transaction Instructions) that are accepted by the
 * TicTacToe Game and Dashboard program
 *
 * @flow
 */

import * as BufferLayout from 'buffer-layout';

const COMMAND_LENGTH = 6;

const Command = {
  // Dashboard account commands
  InitDashboard: 0, // Initialize a dashboard account
  UpdateDashboard: 1, // Update the dashboard with the provided game account

  // Game account commands
  InitGame: 2, // Initialize a game account
  Join: 3, // Player O wants to join
  KeepAlive: 4, // Player X/O keep alive
  Move: 5, // Player X/O mark board position (x, y)
};

function zeroPad(command: Buffer): Buffer {
  if (command.length > COMMAND_LENGTH) {
    throw new Error(
      `command buffer too large: ${command.length} > ${COMMAND_LENGTH}`,
    );
  }
  const buffer = Buffer.alloc(COMMAND_LENGTH);
  command.copy(buffer);
  return buffer;
}

function commandWithNoArgs(command: number): Buffer {
  const layout = BufferLayout.struct([BufferLayout.u32('command')]);
  const buffer = Buffer.alloc(layout.span);
  layout.encode({command}, buffer);
  return zeroPad(buffer);
}

export function initDashboard(): Buffer {
  return commandWithNoArgs(Command.InitDashboard);
}

export function updateDashboard(): Buffer {
  return commandWithNoArgs(Command.UpdateDashboard);
}

export function initGame(): Buffer {
  return commandWithNoArgs(Command.InitGame);
}

export function joinGame(): Buffer {
  return commandWithNoArgs(Command.Join);
}

export function keepAlive(): Buffer {
  return commandWithNoArgs(Command.KeepAlive);
}

export function move(x: number, y: number): Buffer {
  const layout = BufferLayout.struct([
    BufferLayout.u32('command'),
    BufferLayout.u8('x'),
    BufferLayout.u8('y'),
  ]);

  const buffer = Buffer.alloc(layout.span);
  layout.encode({command: Command.Move, x, y}, buffer);
  return zeroPad(buffer);
}
