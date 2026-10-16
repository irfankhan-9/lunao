// MOCKED — in-memory, data lost on container sleep
export const db = {
  prepare: () => ({
    get: () => null,
    all: () => [],
    run: () => ({ changes: 0 }),
  }),
  exec: () => ({}),
  pragma: () => {},
};

export default db;

