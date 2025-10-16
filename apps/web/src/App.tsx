import type { JSX } from 'react';
import AuthPanel from './auth/components/AuthPanel.js';
import './styles.css';

const metrics = [
  { value: '4x', label: 'Faster project delivery' },
  { value: '85%', label: 'Teams adopt within 30 days' },
  { value: '24/7', label: 'Incident visibility' }
];

const App = (): JSX.Element => (
  <div className="page">
    <div className="layout">
      <header className="hero">
        <span className="badge">Taskflow platform</span>
        <h1>Bring clarity to complex work.</h1>
        <p>
          Taskflow orchestrates projects, tasks, and teams so you can ship faster with confidence.
          The full experience is coming online shortly&mdash;for now, explore the mission and stay tuned.
        </p>
        <div className="cta-row">
          <a className="primary" href="mailto:hello@taskflow.app">
            Request early access
          </a>
          <a className="ghost" href="#roadmap">
            View product vision
          </a>
        </div>
      </header>
      <AuthPanel />
    </div>

    <section className="metrics">
      {metrics.map((metric) => (
        <div key={metric.label} className="metric">
          <span className="metric__value">{metric.value}</span>
          <span className="metric__label">{metric.label}</span>
        </div>
      ))}
    </section>

    <section className="roadmap" id="roadmap">
      <h2>What&apos;s shipping next?</h2>
      <ol>
        <li>Authentication, invitations, and role-aware permissions.</li>
        <li>Projects and kanban boards with real-time updates.</li>
        <li>File attachments, comments, and smart notifications.</li>
        <li>Analytics and insights that help teams unblock work.</li>
      </ol>
      <p className="footnote">
        This preview is deployed straight from our CI/CD pipeline. Every push to <code>main</code> rebuilds the API
        and web client so you&apos;ll always see the latest iteration.
      </p>
    </section>
  </div>
);

export default App;
