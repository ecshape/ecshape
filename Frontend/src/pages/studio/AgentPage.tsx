import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Layout from '@/components/Layout';
import { PageHeader } from '@/components/PageHeader';
import AgentChat from '@/components/studio/AgentChat';

/** Full-page Agent EC conversation. Other studio pages can pre-fill a request via navigation state { seed }. */
const AgentPage = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const seed = (location.state as { seed?: string } | null)?.seed ?? null;

  return (
    <Layout currentPage="agent">
      <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-4xl flex-col px-4 py-6 sm:px-6 lg:h-screen lg:py-8">
        <PageHeader eyebrow={t('studio.groupBusiness')} title={t('studio.agent.title')} description={t('studio.agent.subtitle')} className="mb-4 sm:mb-6" />
        <AgentChat page="/studio/agent" seed={seed} className="min-h-0 flex-1" />
      </div>
    </Layout>
  );
};

export default AgentPage;
