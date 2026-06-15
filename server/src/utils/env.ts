type IntOptions = {
  defaultValue: number;
  min?: number;
  max?: number;
  aliases?: string[];
};

type StringOptions = {
  aliases?: string[];
};

type BooleanOptions = {
  defaultValue: boolean;
  aliases?: string[];
};

function getRawEnv(name: string, aliases: string[] = []) {
  for (const currentName of [name, ...aliases]) {
    const value = process.env[currentName];

    if (value !== undefined) {
      return { name: currentName, value };
    }
  }

  return { name, value: undefined };
}

export function getStringEnv(name: string, defaultValue: string, options: StringOptions = {}) {
  const result = getRawEnv(name, options.aliases);

  if (result.value === undefined) {
    return defaultValue;
  }

  if (result.value.trim() === "") {
    throw new Error(`${result.name} cannot be empty.`);
  }

  return result.value;
}

export function getOptionalStringEnv(name: string, options: StringOptions = {}) {
  const result = getRawEnv(name, options.aliases);

  if (result.value === undefined || result.value.trim() === "") {
    return undefined;
  }

  return result.value;
}

export function getBooleanEnv(name: string, options: BooleanOptions) {
  const result = getRawEnv(name, options.aliases);

  if (result.value === undefined) {
    return options.defaultValue;
  }

  const value = result.value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }

  throw new Error(`${result.name} must be a boolean.`);
}

export function getIntEnv(name: string, options: IntOptions) {
  const result = getRawEnv(name, options.aliases);

  if (result.value === undefined) {
    return options.defaultValue;
  }

  if (result.value.trim() === "") {
    throw new Error(`${result.name} cannot be empty.`);
  }

  const value = Number(result.value);

  if (!Number.isInteger(value)) {
    throw new Error(`${result.name} must be an integer.`);
  }

  if (options.min !== undefined && value < options.min) {
    throw new Error(`${result.name} must be at least ${options.min}.`);
  }

  if (options.max !== undefined && value > options.max) {
    throw new Error(`${result.name} must be at most ${options.max}.`);
  }

  return value;
}
