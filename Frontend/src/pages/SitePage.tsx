import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../site/site.css';
import { initSite } from '../site/siteMotion';

/**
 * Public ECshape site (home page for visitors). The markup and motion live in src/site/;
 * this component mounts them and tears them down when the visitor enters the app.
 */
const SitePage = () => {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'ECshape — אליאור קרמיזי | מאמן כושר אישי וליווי אונליין';
    const cleanup = ref.current ? initSite(ref.current, { navigate }) : undefined;
    return () => {
      cleanup?.();
      document.title = prevTitle;
    };
  }, [navigate]);

  return <div ref={ref} className="ec-site" dir="rtl" lang="he" />;
};

export default SitePage;
