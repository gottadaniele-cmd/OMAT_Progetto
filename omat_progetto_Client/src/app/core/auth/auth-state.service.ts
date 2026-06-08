import { Injectable, computed, signal } from '@angular/core';

export type UserRole = 'azienda' | 'admin' | 'studente';

export type AuthUser = {
  id: number;
  email: string;
  role: UserRole;
  name: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  postalCode?: string;
  phone?: string;
};

const STORAGE_KEY = 'omat-user';
const TOKEN_STORAGE_KEY = 'omat-token';

@Injectable({ providedIn: 'root' })
export class AuthStateService {
  private readonly userSignal = signal<AuthUser | null>(this.readStoredUser());
  private readonly tokenSignal = signal<string | null>(this.readStoredToken());

  readonly user = this.userSignal.asReadonly();
  readonly token = this.tokenSignal.asReadonly();
  readonly isLoggedIn = computed(() => Boolean(this.userSignal()));
  readonly role = computed(() => this.userSignal()?.role ?? null);
  readonly displayRole = computed(() => {
    const role = this.userSignal()?.role;

    if (role === 'admin') {
      return 'Admin';
    }

    if (role === 'azienda') {
      return 'Azienda';
    }

    if (role === 'studente') {
      return 'Studente';
    }

    return '';
  });

  setUser(user: AuthUser, token?: string): void {
    this.userSignal.set(user);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));

    if (token) {
      this.tokenSignal.set(token);
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    }
  }

  clearUser(): void {
    this.userSignal.set(null);
    this.tokenSignal.set(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }

  private readStoredUser(): AuthUser | null {
    try {
      const rawUser = localStorage.getItem(STORAGE_KEY);
      return rawUser ? (JSON.parse(rawUser) as AuthUser) : null;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  private readStoredToken(): string | null {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  }
}
