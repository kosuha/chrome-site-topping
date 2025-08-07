import { toggleSidePanel } from './services/chrome';

chrome.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
        await toggleSidePanel(tab.id);
    }
});