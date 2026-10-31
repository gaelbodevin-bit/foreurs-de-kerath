import { RESOURCES } from '../data/resources';
import type { ResourceId } from '../sim/types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SHADE = 'fill="#000" opacity=".28"';
const SHINE = 'fill="#fff" opacity=".4"';

/** Hand-drawn on a 24-unit grid. The base colour comes from the resource, through `currentColor`. */
const ART: Record<ResourceId, string> = {
  ore: `<path fill="currentColor" d="M4.6 8.8 9.8 4c1-.9 2.500-1.100 3.700-.4l5 2.900c1.100.6 1.800 1.700 2 2.900l.8 4.500c.2 1.200-.4 2.400-1.400 3l-5.300 3c-1 .6-2.300.6-3.300.1l-6-3C3.200 16 2.500 14.900 2.500 13.700v-2.200c0-1 .8-2 2.100-2.700z"/>
    <path ${SHADE} d="M2.500 13c2.500 1.500 5 2.500 8 2.500s6.500-1.500 10.600-2.900l.2 1.400c.2 1.200-.4 2.400-1.400 3l-5.300 3c-1 .6-2.300.6-3.300.1l-6-3C3.200 16 2.500 14.900 2.500 13.700z"/>
    <circle cx="9" cy="9" r="1.700" fill="#ffd9a8"/><circle cx="15" cy="11" r="1.200" fill="#ffd9a8"/><circle cx="12" cy="6" r=".8" fill="#ffd9a8"/>`,
  crystal: `<path fill="currentColor" d="M5.200 10.500 8.500 13 8.200 21.500H5a1 1 0 0 1-1-.8L2.800 14.500c-.1-.5 0-.9.300-1.300z"/>
    <path fill="currentColor" d="M18.800 10.500 20.900 13.200c.3.400.4.800.3 1.300L20 20.700a1 1 0 0 1-1 .8h-3.200L15.500 13z"/>
    <path ${SHADE} d="M5.200 10.500 8.500 13 8.200 21.500H5a1 1 0 0 1-1-.8L2.800 14.500c-.1-.5 0-.9.300-1.300zM18.800 10.500 15.500 13l.3 8.500H19a1 1 0 0 0 1-.8l1.200-6.200c.1-.5 0-.9-.3-1.300z"/>
    <path fill="currentColor" d="M11.200 2.500c.4-.5 1.200-.5 1.600 0l3.700 5c.2.300.3.600.2 1L15 20.700c-.1.500-.5.800-1 .8h-4c-.5 0-.9-.3-1-.8L7.300 8.500c-.1-.4 0-.7.200-1z"/>
    <path ${SHINE} d="M12 2.200v19.300h-2c-.5 0-.9-.3-1-.8L7.300 8.500c-.1-.4 0-.7.200-1l3.700-5c.2-.2.500-.3.800-.3z"/>`,
  stone: `<path fill="currentColor" d="M7.500 9.500c1.600-1.100 5.500-1.300 7.500 0l4.200 3c1 .7 2.300 2.400 2.300 4.500 0 2.500-1.500 4-3.500 4H5.500C3.500 21 2.500 19.500 2.500 17.500c0-2 1-3.700 2.200-4.600z"/>
    <path ${SHADE} d="M2.600 16.500c3 1.500 6 2 9.400 2s6.500-.6 9.400-2c.1.200.1.300.1.500 0 2.500-1.500 4-3.500 4H5.500C3.500 21 2.500 19.500 2.500 17.500z"/>
    <path fill="currentColor" d="M9 4.800C10.200 3.400 13 3.200 14.500 4.600l1.700 1.600c.8.800.8 2 .1 2.700-1.500 1.200-7 1.300-8.700 0-.8-.7-.8-1.900-.1-2.700z"/>
    <path ${SHINE} d="M9 4.800C10.200 3.400 13 3.200 14.500 4.600l.5.500c-2-.8-4.800-.5-6.500 1.200l-1-.1z"/>`,
  ice: `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2.500v19M3.800 7.200l16.400 9.600M20.200 7.200 3.800 16.800"/>
      <path d="M9.200 4.200 12 7l2.800-2.800M9.200 19.800 12 17l2.800 2.800M3.300 11.200l3.700-1-1-3.800M20.700 12.800l-3.700 1 1 3.800M20.700 11.200l-3.700-1 1-3.800M3.300 12.800l3.700 1-1 3.800"/>
    </g>`,
  sulfur: `<path fill="currentColor" d="M2.500 20c0-3.600 2.400-6.600 5.400-7.800 1.300-.5 2.600-.7 4.100-.7s2.800.2 4.100.7c3 1.200 5.400 4.200 5.400 7.800 0 .6-.4 1-1 1h-17c-.6 0-1-.4-1-1z"/>
    <path ${SHADE} d="M2.600 19c4 1 14.800 1 18.800 0 .1.300.1.700.1 1 0 .6-.4 1-1 1h-17c-.6 0-1-.4-1-1 0-.3 0-.7.100-1z"/>
    <path fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round" d="M8.500 9c-1.500-1.700 1.500-2.800 0-5M15.500 9c-1.500-1.700 1.500-2.800 0-5"/>
    <circle cx="9" cy="16" r="1.100" fill="#fff6b0"/><circle cx="14.500" cy="15" r=".9" fill="#fff6b0"/>`,
  gold: `<path fill="currentColor" d="M7.300 8h9.400c.5 0 .9.300 1 .8l3.300 10.900c.2.700-.3 1.300-1 1.300H4c-.7 0-1.200-.6-1-1.300L6.300 8.800c.1-.5.500-.8 1-.8z"/>
    <path ${SHINE} d="M8.200 10.200h7.600l.9 3.300H7.300z"/>
    <path ${SHADE} d="M3.600 18h16.800l.6 1.700c.2.700-.3 1.300-1 1.300H4c-.7 0-1.200-.6-1-1.300z"/>
    <path fill="#fff4c4" d="M19 2.500l.9 2.100 2.100.9-2.100.9-.9 2.100-.9-2.100-2.100-.9 2.100-.9z"/>`,
  relic: `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.400"/>
    <path fill="currentColor" d="M12 6c.3 0 .5.100.7.300l5 5c.4.400.4 1 0 1.400l-5 5c-.4.400-1 .4-1.400 0l-5-5c-.4-.4-.4-1 0-1.400l5-5c.2-.2.400-.3.700-.3z"/>
    <circle cx="12" cy="12" r="2.200" fill="#fff"/><circle cx="12" cy="12" r="1" fill="#3b1b63"/>`,
  metal: `<path fill="currentColor" d="M5 3.500h14a1.500 1.500 0 0 1 0 5h-4.500v7H19a1.500 1.500 0 0 1 0 5H5a1.500 1.500 0 0 1 0-5h4.500v-7H5a1.500 1.500 0 0 1 0-5z"/>
    <path ${SHINE} d="M5 4.500h14c.3 0 .5 0 .7.200H4.300c.2-.2.400-.2.700-.2zM9.500 8.500h1.500v7H9.500z"/>
    <path ${SHADE} d="M3.600 7.500h16.800c-.3.600-.8 1-1.400 1H5c-.6 0-1.100-.4-1.400-1zM3.600 19.500h16.800c-.3.600-.8 1-1.400 1H5c-.6 0-1.100-.4-1.400-1z"/>`,
  water: `<path fill="currentColor" d="M12 2.500c3.300 4.400 7 8.400 7 12.500a7 7 0 0 1-14 0c0-4.100 3.700-8.100 7-12.500z"/>
    <path ${SHADE} d="M19 15a7 7 0 0 1-14 0c0-.3 0-.7.100-1 1 3.200 3.800 5 6.900 5s5.900-1.800 6.900-5c.1.300.1.700.1 1z"/>
    <path fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.700" stroke-linecap="round" d="M8.500 14.500c.1-1.500 1-3 2-4.500"/>`,
  food: `<path fill="#efe6c8" d="M9.500 13.500h5l1 6.500c.1.800-.5 1.500-1.300 1.500H9.800c-.8 0-1.400-.7-1.300-1.500z"/>
    <path fill="currentColor" d="M2.500 12.500a9.500 9.500 0 0 1 19 0c0 1-.7 1.500-1.500 1.500H4c-.8 0-1.500-.5-1.500-1.500z"/>
    <path ${SHADE} d="M2.600 11.500c3 1.200 15.800 1.200 18.800 0 .1.300.1.700.1 1 0 1-.7 1.500-1.500 1.500H4c-.8 0-1.500-.5-1.500-1.500 0-.3 0-.7.100-1z"/>
    <circle cx="8.500" cy="8" r="1.500" fill="#fff" opacity=".85"/><circle cx="14" cy="6.500" r="1.100" fill="#fff" opacity=".85"/><circle cx="16.500" cy="10" r=".9" fill="#fff" opacity=".85"/>`,
  alloy: `<path fill="currentColor" fill-rule="evenodd" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M12 3.200 19.700 7.600v8.800L12 20.800 4.300 16.400V7.600zM12 8.500a3.500 3.500 0 1 0 0 7 3.500 3.500 0 0 0 0-7z"/>
    <path ${SHINE} d="M12 2.500 5 6.500l3.800 2.300A4.500 4.500 0 0 1 12 7.500z"/>
    <path ${SHADE} d="M19.300 16.800 15.500 14.600a4.500 4.500 0 0 1-3.500 1.900v5z"/>`,
  credits: `<circle cx="12" cy="12" r="9.500" fill="currentColor"/>
    <circle cx="12" cy="12" r="7" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="1.300"/>
    <path fill="none" stroke="#000" stroke-opacity=".55" stroke-width="2" stroke-linecap="round" d="M14.800 9.500a3.500 3.500 0 1 0 0 5M12 6.500v11"/>`,
};

/** A fresh icon, because a DOM node can only sit in one place. */
export function resourceIcon(id: ResourceId): SVGSVGElement {
  const def = RESOURCES[id];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'res-icon');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', def.name);
  svg.style.color = `#${def.color.toString(16).padStart(6, '0')}`;
  svg.innerHTML = ART[id];
  return svg;
}
