import type { JSX } from 'react';
import AuthPanel from '../auth/components/AuthPanel.js';

const WelcomePage = (): JSX.Element => (
  <div className="welcome">
    <div className="welcome__panel">
      <section className="welcome__copy">
        <span className="welcome__badge">Taskflow</span>
        <h1>Plan work with confidence</h1>
        <p>
          Sign in or create your workspace to invite teammates, manage projects, and track progress in one place.
        </p>
      </section>
      <AuthPanel />
    </div>
  </div>
);

export default WelcomePage;
