/**
 * Computes line-by-line diff between two text strings using Longest Common Subsequence (LCS).
 * Formatted specifically for Git Pull Request style diffs with green additions (+) and red deletions (-).
 */

export function computeLineDiff(oldText = '', newText = '') {
  const oldLines = (oldText || '').replace(/\r\n/g, '\n').split('\n');
  const newLines = (newText || '').replace(/\r\n/g, '\n').split('\n');

  const n = oldLines.length;
  const m = newLines.length;

  // LCS Matrix
  // Use Uint16Array for memory efficiency
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (oldLines[i] === newLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack to build unified diff lines
  let i = n;
  let j = m;
  const unifiedLines = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      unifiedLines.unshift({
        type: 'equal',
        oldLine: i,
        newLine: j,
        text: oldLines[i - 1]
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      unifiedLines.unshift({
        type: 'insert',
        oldLine: null,
        newLine: j,
        text: newLines[j - 1]
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      unifiedLines.unshift({
        type: 'delete',
        oldLine: i,
        newLine: null,
        text: oldLines[i - 1]
      });
      i--;
    }
  }

  // Build split (side-by-side) rows for side-by-side PR comparison
  const splitRows = [];
  let uIdx = 0;
  while (uIdx < unifiedLines.length) {
    const item = unifiedLines[uIdx];
    if (item.type === 'equal') {
      splitRows.push({
        left: { line: item.oldLine, text: item.text, type: 'equal' },
        right: { line: item.newLine, text: item.text, type: 'equal' }
      });
      uIdx++;
    } else {
      const deletes = [];
      while (uIdx < unifiedLines.length && unifiedLines[uIdx].type === 'delete') {
        deletes.push(unifiedLines[uIdx]);
        uIdx++;
      }
      const inserts = [];
      while (uIdx < unifiedLines.length && unifiedLines[uIdx].type === 'insert') {
        inserts.push(unifiedLines[uIdx]);
        uIdx++;
      }
      const count = Math.max(deletes.length, inserts.length);
      for (let k = 0; k < count; k++) {
        const d = deletes[k];
        const ins = inserts[k];
        splitRows.push({
          left: d ? { line: d.oldLine, text: d.text, type: 'delete' } : { line: null, text: '', type: 'empty' },
          right: ins ? { line: ins.newLine, text: ins.text, type: 'insert' } : { line: null, text: '', type: 'empty' }
        });
      }
    }
  }

  const additions = unifiedLines.filter((l) => l.type === 'insert').length;
  const deletions = unifiedLines.filter((l) => l.type === 'delete').length;

  return {
    diffLines: unifiedLines,
    splitRows,
    stats: {
      additions,
      deletions,
      totalChanges: additions + deletions
    }
  };
}

/**
 * Fast client-side fallback repair for known Selenium, JUnit, and syntax patterns
 */
export function quickHealJavaCode(code = '', errorMessage = '') {
  if (!code) return '';
  let healed = code;

  // 1. Fix intentional type mismatch (e.g. ErrorTest)
  if (healed.includes('int broken = "this is not an integer";')) {
    healed = healed.replace(
      'int broken = "this is not an integer";',
      'String broken = "this is not an integer"; // [PR FIX] Corrected type to String'
    );
  }

  // 2. Fix driver.manage().implicitlyWait(...) missing .timeouts()
  if (healed.includes('.manage().implicitlyWait(')) {
    healed = healed.replace('.manage().implicitlyWait(', '.manage().timeouts().implicitlyWait(');
  }

  // 3. Fix By.value("...") hallucination
  if (healed.includes('By.value(')) {
    healed = healed.replace(/By\.value\((["'][^"']*?["'])\)/g, 'By.cssSelector("option[value=" + $1 + "]")');
  }

  // 4. Fix dropdown.selectOption(...) or dropdown.selectByValue(...) on WebElement.
  // Never wrap a variable already declared as Select, and repair previously
  // corrupted new Select(selectVar).method(...) calls.
  const selectDeclRe = /\bSelect\s+([A-Za-z0-9_]+)\s*=/g;
  const selectVars = new Set();
  let declMatch;
  while ((declMatch = selectDeclRe.exec(healed)) !== null) {
    selectVars.add(declMatch[1]);
  }

  healed = healed.replace(
    /([a-zA-Z0-9_]+)\.selectOption\s*\((.*?)\);/g,
    (m, v, args) => {
      if (selectVars.has(v)) return `${v}.selectByVisibleText(${args});`;
      return `new org.openqa.selenium.support.ui.Select(${v}).selectByVisibleText(${args});`;
    }
  );
  healed = healed.replace(
    /(?<!new\s+Select\()([a-zA-Z0-9_]+)\.selectByValue\s*\((.*?)\);/g,
    (m, v, args) => {
      if (selectVars.has(v)) return m;
      return `new org.openqa.selenium.support.ui.Select(${v}).selectByValue(${args});`;
    }
  );
  healed = healed.replace(
    /(?<!new\s+Select\()([a-zA-Z0-9_]+)\.selectByVisibleText\s*\((.*?)\);/g,
    (m, v, args) => {
      if (selectVars.has(v)) return m;
      return `new org.openqa.selenium.support.ui.Select(${v}).selectByVisibleText(${args});`;
    }
  );
  healed = healed.replace(
    /new\s+(?:org\.openqa\.selenium\.support\.ui\.)?Select\s*\(\s*([A-Za-z0-9_]+)\s*\)\s*\./g,
    (m, v) => (selectVars.has(v) ? `${v}.` : m)
  );

  // 5. Ensure missing imports
  if (healed.includes('Select') && !healed.includes('import org.openqa.selenium.support.ui.Select;')) {
    healed = 'import org.openqa.selenium.support.ui.Select;\n' + healed;
  }
  if (
    (healed.includes('assertEquals(') || healed.includes('assertTrue(') || healed.includes('assertFalse(')) &&
    !healed.includes('org.junit.jupiter.api.Assertions')
  ) {
    healed = 'import static org.junit.jupiter.api.Assertions.*;\n' + healed;
  }
  if (healed.includes('Duration.of') && !healed.includes('import java.time.Duration;')) {
    healed = 'import java.time.Duration;\n' + healed;
  }
  if (healed.includes('WebElement') && !healed.includes('import org.openqa.selenium.WebElement;')) {
    healed = 'import org.openqa.selenium.WebElement;\n' + healed;
  }
  if (healed.includes('WebDriverWait') && !healed.includes('import org.openqa.selenium.support.ui.WebDriverWait;')) {
    healed = 'import org.openqa.selenium.support.ui.WebDriverWait;\n' + healed;
  }
  if (healed.includes('ExpectedConditions') && !healed.includes('import org.openqa.selenium.support.ui.ExpectedConditions;')) {
    healed = 'import org.openqa.selenium.support.ui.ExpectedConditions;\n' + healed;
  }
  if (healed.includes('@Test') && !healed.includes('import org.junit.jupiter.api.Test;')) {
    healed = 'import org.junit.jupiter.api.Test;\n' + healed;
  }
  if (healed.includes('@BeforeEach') && !healed.includes('import org.junit.jupiter.api.BeforeEach;')) {
    healed = 'import org.junit.jupiter.api.BeforeEach;\n' + healed;
  }
  if (healed.includes('@AfterEach') && !healed.includes('import org.junit.jupiter.api.AfterEach;')) {
    healed = 'import org.junit.jupiter.api.AfterEach;\n' + healed;
  }

  return healed;
}
