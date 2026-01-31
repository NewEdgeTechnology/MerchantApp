// utils/authToken.js
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '@env';

export async function saveToken(token) {
  const now = new Date();

  // Convert minutes to expiry timestamp
  const accessTokenExpires = new Date(now.getTime() + token.access_token_time * 60 * 1000);
  const refreshTokenExpires = new Date(now.getTime() + token.refresh_token_time * 60 * 1000);

  await SecureStore.setItemAsync('access_token', token.access_token);
  await SecureStore.setItemAsync('accessTokenExpires', accessTokenExpires.toISOString());

  await SecureStore.setItemAsync('refresh_token', token.refresh_token);
  await SecureStore.setItemAsync('refreshTokenExpires', refreshTokenExpires.toISOString());
}

//validating the refresh token
export async function getValidRefreshToken() {
  const token = await SecureStore.getItemAsync('refresh_token');
  const expires = await SecureStore.getItemAsync('refreshTokenExpires');

  if (!token || !expires) return null;

  if (new Date() > new Date(expires)) {
    await deleteTokens();
    return null;
  }
  return token;
}


// auto refreshing the access token
export async function getValidAccessToken() {
  const token = await SecureStore.getItemAsync('access_token');
  const expires = await SecureStore.getItemAsync('accessTokenExpires');

  if (!token || !expires) return await tryRefreshAccessToken();

  if (new Date() > new Date(expires)) {
    return await tryRefreshAccessToken();
  }

  return token;
}

async function tryRefreshAccessToken() {
  const refreshToken = await getValidRefreshToken();
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const newToken = response.data; // assuming it returns access_token and access_token_time
    await saveToken(newToken);      // reuse your saveToken function
    return newToken.access_token;
  } catch (err) {
    console.error('Refresh failed:', err);
    await deleteTokens();
    return null;
  }
}

// deleting the tokens
export async function deleteTokens() {
  await SecureStore.deleteItemAsync('access_token');
  await SecureStore.deleteItemAsync('accessTokenExpires');
  await SecureStore.deleteItemAsync('refresh_token');
  await SecureStore.deleteItemAsync('refreshTokenExpires');
  console.log("Logged out successfully");
}

export async function saveUserInfo(userInfo) {
  await SecureStore.setItemAsync('user_info', JSON.stringify(userInfo));
}
export async function getUserInfo() {
  const userInfo = await SecureStore.getItemAsync('user_info');
  return userInfo ? JSON.parse(userInfo) : null;
}
