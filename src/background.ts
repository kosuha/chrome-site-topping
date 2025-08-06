chrome.action.onClicked.addListener(async (tab) => {
    try {
        await chrome.tabs.sendMessage(tab.id!, { action: 'toggleSidePanel' });
    } catch (error) {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            files: ['src/content.tsx']
        });
        
        setTimeout(async () => {
            try {
                await chrome.tabs.sendMessage(tab.id!, { action: 'toggleSidePanel' });
            } catch (retryError) {
                console.error('Failed to toggle side panel:', retryError);
            }
        }, 100);
    }
});