export interface Role {
  id: number;
  code: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  verified: boolean;
  roles: Role[];
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthData {
  user: User;
  tokens: Tokens;
}

export interface AuthResponse {
  message: string;
  success: boolean;
  data: AuthData;
}

export interface AuthError {
  message: string;
  success: boolean;
}
