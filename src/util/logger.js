'use strict';

const NODE_ENV = process.env.NODE_ENV || 'production';

function fmt(level, msg, meta) {
  const ts = new Date().toISOString();
  const tail = meta ? ' ' + JSON.stringify(meta) : '';
  return `${ts} [${level}] ${msg}${tail}`;
}

const logger = {
  info:  (msg, meta) => console.log(fmt('INFO',  msg, meta)),
  warn:  (msg, meta) => console.warn(fmt('WARN', msg, meta)),
  error: (msg, meta) => console.error(fmt('ERROR', msg, meta)),
  debug: (msg, meta) => { if (NODE_ENV !== 'production') console.log(fmt('DEBUG', msg, meta)); },
};

module.exports = logger;
