const { McpError } = require('./sessionRegistry');

/** Provides parameter and slider semantics over normalized Desmos expressions. */
class ParameterService {
  list(expressions) {
    return expressions
      .filter(isParameterExpression)
      .map(expression => this.describe(expression));
  }

  get(expressions, parameterName) {
    const parameter = this.list(expressions).find(item => item.name === parameterName);
    if (!parameter) throw new McpError('DESMOS_PARAMETER_NOT_FOUND', `Parameter not found: ${parameterName}`);
    return parameter;
  }

  describe(expression) {
    const name = parseParameterName(expression.latex);
    const value = parseNumericValue(expression.latex);
    const bounds = expression.sliderBounds || {};
    return {
      expressionId: expression.id,
      name,
      latex: expression.latex,
      value,
      min: finiteOrUndefined(bounds.min),
      max: finiteOrUndefined(bounds.max),
      step: finiteOrUndefined(bounds.step),
      playing: expression.playing === true,
      animationSupported: typeof expression.playing === 'boolean',
      loopMode: expression.loopMode,
      hidden: expression.hidden === true
    };
  }

  validateUpdate(expressions, parameterName, patch) {
    const parameter = this.get(expressions, parameterName);
    const nextValue = patch.value === undefined ? parameter.value : Number(patch.value);
    if (!Number.isFinite(nextValue)) throw new McpError('DESMOS_INVALID_PARAMETER', 'Parameter value must be a finite number.');
    const min = patch.min === undefined ? parameter.min : Number(patch.min);
    const max = patch.max === undefined ? parameter.max : Number(patch.max);
    const step = patch.step === undefined ? parameter.step : Number(patch.step);
    if (min !== undefined && !Number.isFinite(min)) throw new McpError('DESMOS_INVALID_PARAMETER', 'Parameter min must be a finite number.');
    if (max !== undefined && !Number.isFinite(max)) throw new McpError('DESMOS_INVALID_PARAMETER', 'Parameter max must be a finite number.');
    if (min !== undefined && max !== undefined && min >= max) throw new McpError('DESMOS_INVALID_PARAMETER', 'Parameter min must be less than max.');
    if (step !== undefined && (!Number.isFinite(step) || step <= 0)) throw new McpError('DESMOS_INVALID_PARAMETER', 'Parameter step must be greater than zero.');
    return { parameter, patch: { value: nextValue, min, max, step } };
  }

  impact(expressions, parameterName) {
    const references = [];
    for (const expression of expressions) {
      if (!expression.latex || expression.latex === `${parameterName}=${parseNumericValue(expression.latex)}`) continue;
      if (new RegExp(`(^|[^A-Za-z0-9_])${escapeRegex(parameterName)}([^A-Za-z0-9_]|$)`).test(expression.latex)) {
        references.push({ expressionId: expression.id, latex: expression.latex });
      }
    }
    return { parameter: parameterName, expressionCount: references.length, expressions: references };
  }
}

function isParameterExpression(expression) {
  return Boolean(parseParameterName(expression?.latex));
}

function parseParameterName(latex) {
  const match = /^\s*([A-Za-z_][A-Za-z0-9_]*(?:_[A-Za-z0-9]+)?)\s*=\s*[-+]?\d(?:[\d.]*)/.exec(latex || '');
  return match?.[1];
}

function parseNumericValue(latex) {
  const match = /^\s*[A-Za-z_][A-Za-z0-9_]*(?:_[A-Za-z0-9]+)?\s*=\s*([-+]?\d(?:[\d.]*)(?:e[-+]?\d+)?)?/i.exec(latex || '');
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

function finiteOrUndefined(value) {
  return Number.isFinite(value) ? value : undefined;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { ParameterService, parseParameterName, parseNumericValue, isParameterExpression };
