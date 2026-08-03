const IDENTIFIER_PATTERN = /[A-Za-z_][A-Za-z0-9_]*/g;
const RESERVED_IDENTIFIERS = new Set([
  // Desmos treats these as implicit graph coordinates or common mathematical names.
  'x', 'y', 't', 'u', 'v', 'n', 'a', 'b', 'c',
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'sqrt', 'abs', 'ceil', 'floor', 'round', 'ln',
  'log', 'exp', 'min', 'max', 'mod', 'gcd', 'lcm', 'pi', 'e', 'infty',
  'random', 'derivative', 'integral', 'distance', 'polygon', 'circle',
  'midpoint', 'intersection', 'point', 'vector', 'for', 'and', 'or', 'not'
]);

/** Pure graph inspection helpers. They do not call the Desmos runtime. */
class GraphAnalyzer {
  analyze(state) {
    const expressions = state?.expressions?.list || [];
    const definitions = collectDefinitions(expressions);
    const issues = [];

    for (const expression of expressions) {
      const latex = typeof expression.latex === 'string' ? expression.latex.trim() : '';
      if (!latex && !isContainer(expression)) {
        issues.push(issue('warning', 'EMPTY_EXPRESSION', expression.id, 'Expression has no LaTeX content.'));
        continue;
      }
      if (expression.id && definitions.ids.get(expression.id) > 1) {
        issues.push(issue('error', 'DUPLICATE_ID', expression.id, 'Expression ID is duplicated.'));
      }
      for (const variable of extractReferencedVariables(latex)) {
        if (!definitions.names.has(variable) && !RESERVED_IDENTIFIERS.has(variable)) {
          issues.push(issue('warning', 'UNDEFINED_VARIABLE', expression.id, `Variable ${variable} is referenced but no definition was found.`, { variable }));
        }
      }
    }

    const viewport = state?.graph?.viewport;
    if (!isValidViewport(viewport)) {
      issues.push(issue('warning', 'INVALID_VIEWPORT', undefined, 'Graph viewport is missing or has invalid bounds.'));
    }

    return {
      ok: !issues.some(item => item.severity === 'error'),
      issues,
      stats: {
        expressionCount: expressions.length,
        visibleExpressionCount: expressions.filter(isVisible).length,
        hiddenExpressionCount: expressions.filter(expression => !isVisible(expression)).length,
        parameterCount: [...definitions.names].filter(name => isLikelyParameter(name, expressions)).length,
        folderCount: expressions.filter(expression => expression.type === 'folder').length,
        noteCount: expressions.filter(expression => expression.type === 'text').length,
        tableCount: expressions.filter(expression => expression.type === 'table').length
      },
      viewport
    };
  }

  analyzeExpression(expressions, expressionId) {
    const expression = expressions.find(item => item.id === expressionId);
    if (!expression) {
      return { found: false, expressionId, variables: [], definitions: [] };
    }
    const latex = typeof expression.latex === 'string' ? expression.latex : '';
    const definitions = extractDefinitions(latex);
    const variables = extractReferencedVariables(latex);
    return {
      found: true,
      expressionId,
      type: expression.type || 'expression',
      latex,
      variables,
      definitions,
      visible: isVisible(expression),
      color: expression.color,
      hidden: expression.hidden === true
    };
  }

  dependencies(expressions) {
    const definitions = collectDefinitions(expressions);
    return expressions
      .filter(expression => typeof expression.latex === 'string' && expression.latex.trim())
      .map(expression => {
        const referenced = extractReferencedVariables(expression.latex);
        return {
          expressionId: expression.id,
          latex: expression.latex,
          defines: extractDefinitions(expression.latex),
          references: referenced,
          dependencies: referenced
            .filter(name => definitions.byName.has(name))
            .flatMap(name => definitions.byName.get(name).map(item => item.id))
        };
      });
  }
}

function collectDefinitions(expressions) {
  const ids = new Map();
  const names = new Set();
  const byName = new Map();
  for (const expression of expressions) {
    if (expression.id) ids.set(expression.id, (ids.get(expression.id) || 0) + 1);
    const definitions = extractDefinitions(expression.latex || '');
    for (const name of definitions) {
      names.add(name);
      const entries = byName.get(name) || [];
      entries.push(expression);
      byName.set(name, entries);
    }
  }
  return { ids, names, byName };
}

function extractDefinitions(latex) {
  const matches = [];
  const definitionPattern = /(?:^|[;\\,])\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:_[A-Za-z0-9]+)?\s*(?::=|=|~)/g;
  let match;
  while ((match = definitionPattern.exec(latex)) !== null) matches.push(match[1]);
  return [...new Set(matches)];
}

function extractReferencedVariables(latex) {
  const definitions = new Set(extractDefinitions(latex));
  const variables = [];
  for (const token of latex.match(IDENTIFIER_PATTERN) || []) {
    if (!definitions.has(token) && !RESERVED_IDENTIFIERS.has(token) && !variables.includes(token)) variables.push(token);
  }
  return variables;
}

function isContainer(expression) {
  return ['folder', 'text', 'table', 'image'].includes(expression?.type);
}

function isVisible(expression) {
  return expression?.hidden !== true && expression?.secret !== true;
}

function isLikelyParameter(name, expressions) {
  return expressions.some(expression => {
    const latex = expression.latex || '';
    return new RegExp(`^\\s*${escapeRegex(name)}(?:_[A-Za-z0-9]+)?\\s*=\\s*[-+]?\\d`).test(latex);
  });
}

function isValidViewport(viewport) {
  return viewport && Number.isFinite(viewport.left) && Number.isFinite(viewport.right)
    && Number.isFinite(viewport.bottom) && Number.isFinite(viewport.top)
    && viewport.left < viewport.right && viewport.bottom < viewport.top;
}

function issue(severity, code, expressionId, message, details = undefined) {
  return { severity, code, ...(expressionId ? { expressionId } : {}), message, ...(details ? { details } : {}) };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { GraphAnalyzer, extractDefinitions, extractReferencedVariables };
