export const handleSelectReplacement = async (items, setReplacementItems, setReplacementModalVisible) => {
  try {
    const replacementItems = await fetchSimilarItems(items);
    setReplacementItems(replacementItems);
    setReplacementModalVisible(true);
  } catch (error) {
    console.error('Failed to fetch replacement items:', error);
    Alert.alert('Error', 'Failed to fetch replacement items. Please try again later.');
  }
};

export const fetchSimilarItems = async (items) => {
  const itemName = items[0].item_name; // Assuming we're replacing the first item
  const res = await fetch(`https://your-api-url.com/similar-items?name=${encodeURIComponent(itemName)}`);
  const data = await res.json();
  return data; // Return a list of similar items
};
