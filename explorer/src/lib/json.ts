import jsonParser from 'json-bigint';

export const { parse, stringify } = jsonParser({
  useNativeBigInt: true,
});
