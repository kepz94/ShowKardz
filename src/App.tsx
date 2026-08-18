import { useEffect, useState } from 'react';
import { Home } from './screens/Home';
import { NightBefore } from './screens/NightBefore';
import { CashSale } from './screens/CashSale';
import { CloseOut } from './screens/CloseOut';

export type Route = 'home' | 'night' | 'sale' | 'close';

const ROUTES: Route[] = ['home', 'night', 'sale', 'close'];

function currentRoute(): Route {
  const h = location.hash.replace('#/', '') as Route;
  return ROUTES.includes(h) ? h : 'home';
}

/**
 * Hash routing, so a cold start lands on the screen the dealer was using. iOS
 * kills PWA processes constantly and sessions here are interrupted by
 * definition — someone is standing at the table waiting.
 */
export function App() {
  const [route, setRoute] = useState<Route>(currentRoute);

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const go = (r: Route) => {
    location.hash = r === 'home' ? '#/' : `#/${r}`;
  };

  return (
    <div className="app">
      {route === 'home' && <Home go={go} />}
      {route === 'night' && <NightBefore go={go} />}
      {route === 'sale' && <CashSale go={go} />}
      {route === 'close' && <CloseOut go={go} />}
    </div>
  );
}
