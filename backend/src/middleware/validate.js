/**
 * Joi validation middleware factory.
 * @param {import('joi').Schema} schema
 * @param {'body'|'query'|'params'} [property='body']
 */
export function validate(schema, property = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      convert: true,
    });
    if (error) {
      return res.status(400).json({
        error: 'ValidationError',
        statusCode: 400,
        message: error.details.map((d) => d.message).join('; '),
        details: error.details.map((d) => ({ path: d.path.join('.'), message: d.message })),
      });
    }
    req[property] = value;
    next();
  };
}
