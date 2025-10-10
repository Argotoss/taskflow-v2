import argon2 from 'argon2';
import type { Options } from 'argon2';

const hashingOptions: Options = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 1
};

export const hashPassword = async (password: string): Promise<string> => {
  return argon2.hash(password, hashingOptions);
};

export const verifyPassword = async (hash: string, candidate: string): Promise<boolean> => {
  return argon2.verify(hash, candidate);
};
