import React, { useEffect } from 'react';
import Layout from '../components/Layout';
import Chat from '../components/Chat';
import { useSearchParams } from 'react-router-dom';

const ChatPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get('clientId');
  const progressEntryId = searchParams.get('progressEntryId');

  useEffect(() => {
    // Prevent body scroll on mobile when chat is open
    document.body.style.overflow = 'hidden';
    // Prevent main element from scrolling
    const mainElement = document.querySelector('main');
    if (mainElement) {
      mainElement.style.overflow = 'hidden';
      mainElement.style.height = '100%';
    }
    return () => {
      document.body.style.overflow = '';
      const mainElement = document.querySelector('main');
      if (mainElement) {
        mainElement.style.overflow = '';
        mainElement.style.height = '';
      }
    };
  }, []);

  return (
    <Layout>
      <div className="w-full h-full overflow-hidden flex flex-col">
        <Chat
          selectedClientId={clientId ? parseInt(clientId) : null}
          progressEntryId={progressEntryId ? parseInt(progressEntryId) : null}
        />
      </div>
    </Layout>
  );
};

export default ChatPage;

