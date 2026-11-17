import React from 'react';
import Layout from '../components/Layout';
import Chat from '../components/Chat';

/** Chat page: selection (?clientId=) and a pre-attached entry (?progressEntryId=) are read by <Chat />. */
const ChatPage: React.FC = () => (
  <Layout currentPage="chat">
    <Chat />
  </Layout>
);

export default ChatPage;
