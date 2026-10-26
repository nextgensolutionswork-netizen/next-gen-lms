import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Exercise real React effects without a server or real assessment writes.
const bundle = await build({
  stdin: {
    contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { QuizRunnerModal } from './components/portal/quiz-runner-modal';
      const quiz = { id: 'timer-test', title: 'Timer regression', time_limit_minutes: 0.05 };
      const questions = [{ id: 'q1', question_text: 'Choose an answer', points: 1,
        options: [{ id: 'a', text: 'First answer' }, { id: 'b', text: 'Latest answer' }] }];
      window.submissions = [];
      window.fetch = async (_url, options) => {
        window.submissions.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ success: true, attempt: {}, evaluation: {
          passed: true, percentage: 100, score: 1, total_points: 1,
          passing_percentage: 70, questionResults: []
        } }) };
      };
      const root = createRoot(document.getElementById('root'));
      window.renderQuiz = (isOpen) => root.render(<React.StrictMode>
        <QuizRunnerModal isOpen={isOpen} onClose={() => {}} quiz={quiz} questions={questions}
          studentId="test-student" courseId="test-course" onQuizCompleted={() => {}} />
      </React.StrictMode>);
      window.renderQuiz(true);
    `,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  platform: 'browser',
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{
    name: 'isolate-assessment-service',
    setup(builder) {
      builder.onResolve({ filter: /academics-service$/ }, () => ({ path: 'assessment', namespace: 'mock' }));
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents:
        'export function evaluateQuizSubmission() { throw new Error("Unexpected fallback"); } export function recordQuizAttempt() { throw new Error("Unexpected write"); }',
      }));
    },
  }],
});

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByText('First answer', { exact: true }).click();
  await page.clock.runFor(1000);
  await page.getByText('Latest answer', { exact: true }).click();
  await page.clock.runFor(2100);
  await page.waitForFunction(() => window.submissions.length === 1);
  assert.equal(await page.evaluate(() => window.submissions[0].answers.q1), 'b');
  await page.clock.runFor(5000);
  assert.equal(await page.evaluate(() => window.submissions.length), 1);
  await page.evaluate(() => window.renderQuiz(false));
  await page.getByText('Assessment Passed!', { exact: true }).waitFor({ state: 'hidden' });
  await page.evaluate(() => window.renderQuiz(true));
  await page.getByText('First answer', { exact: true }).click();
  assert.equal(await page.evaluate(() => window.submissions.length), 1);
  await page.clock.runFor(3100);
  await page.waitForFunction(() => window.submissions.length === 2);
  assert.equal(await page.evaluate(() => window.submissions[1].answers.q1), 'a');
  assert.deepEqual(errors, []);
  console.log('PASS: timeout submits latest answers once, and reopening resets the timer (React StrictMode).');
} finally {
  await browser.close();
}
