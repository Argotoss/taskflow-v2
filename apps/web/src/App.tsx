import type { JSX } from 'react';
import './styles.css';
import { useAuth } from './auth/useAuth.js';
import WelcomePage from './components/WelcomePage.js';
import BoardLayout from './components/BoardLayout.js';

const App = (): JSX.Element => {
  const auth = useAuth();

  if (!auth.ready) {
    return (
      <div className="loading-screen">
        <span>Loading Taskflow…</span>
      </div>
    );
  }

  if (!auth.user) {
    return <WelcomePage />;
  }

  return <BoardLayout />;
};

export default App;
