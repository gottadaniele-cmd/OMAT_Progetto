import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { OrderRequest, OrderStatus } from '../models/order.model';
import { PctoRequest, PctoRequestStatus } from '../models/pcto-request.model';
import { AuthStateService } from '../auth/auth-state.service';

export type CreateOrderPayload = {
  title: string;
  material: string;
  description: string;
  priority: string;
  quantity: number;
  notes?: string;
  attachments?: Array<{
    fileName: string;
    contentType: string;
    size: number;
    dataUrl?: string;
  }>;
};

export type CreatePctoPayload = {
  firstName: string;
  lastName: string;
  email: string;
  city: string;
  postalCode: string;
  school: string;
  classYear: string;
  studyProgram: string;
  startDate: string;
  endDate: string;
  motivation: string;
};

export type LoginResponse = {
  token: string;
  user: {
    id: number;
    email: string;
    role: 'azienda' | 'admin' | 'studente';
    name: string;
    firstName?: string;
    lastName?: string;
    city?: string;
    postalCode?: string;
    phone?: string;
  };
};

export type CurrentUserResponse = LoginResponse['user'] & {
  firstName?: string;
  lastName?: string;
  city?: string;
  postalCode?: string;
  phone?: string;
};

export type RegisterAdminPayload = {
  nome: string;
  cognome: string;
  ruolo: string;
  dataNascita?: string;
  numeroTelefono?: string;
  email: string;
  password: string;
};

export type RegisterCompanyPayload = {
  nomeAzienda: string;
  emailAzienda: string;
  password: string;
  luogo: string;
  contattoTelefonico: string;
};

export type RegisterStudentPayload = {
  nome: string;
  cognome?: string;
  numeroTelefono: string;
  email: string;
  citta?: string;
  cap: number;
  password: string;
};

@Injectable({ providedIn: 'root' })
export class OmatApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthStateService);
  private readonly baseUrl = 'http://127.0.0.1:3001/api';

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(
      `${this.baseUrl}/auth/login`,
      { email, password },
      { withCredentials: true },
    );
  }

  logout(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(
      `${this.baseUrl}/auth/logout`,
      {},
      this.requestOptions(),
    );
  }

  getCurrentUser(): Observable<CurrentUserResponse> {
    return this.http.get<CurrentUserResponse>(`${this.baseUrl}/auth/me`, this.requestOptions());
  }

  createOrder(payload: CreateOrderPayload): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/orders`, payload, this.requestOptions());
  }

  getOrders(): Observable<OrderRequest[]> {
    return this.http.get<OrderRequest[]>(`${this.baseUrl}/orders`, this.requestOptions());
  }

  getOrder(id: string): Observable<OrderRequest> {
    return this.http.get<OrderRequest>(`${this.baseUrl}/orders/${id}`, this.requestOptions());
  }

  updateOrderStatus(id: string, status: OrderStatus): Observable<OrderRequest> {
    return this.http.patch<OrderRequest>(
      `${this.baseUrl}/orders/${id}/status`,
      { status },
      this.requestOptions(),
    );
  }

  registerAdmin(payload: RegisterAdminPayload): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/auth/register-admin`, payload, {
      withCredentials: true,
    });
  }

  registerCompany(payload: RegisterCompanyPayload): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/auth/register-company`, payload, {
      withCredentials: true,
    });
  }

  registerStudent(payload: RegisterStudentPayload): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/auth/register-student`, payload, {
      withCredentials: true,
    });
  }

  createPctoRequest(payload: CreatePctoPayload): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/pcto`, payload, this.requestOptions());
  }

  getPctoRequests(): Observable<PctoRequest[]> {
    return this.http.get<PctoRequest[]>(`${this.baseUrl}/pcto`, this.requestOptions());
  }

  getPctoRequest(id: string): Observable<PctoRequest> {
    return this.http.get<PctoRequest>(`${this.baseUrl}/pcto/${id}`, this.requestOptions());
  }

  updatePctoStatus(id: string, status: PctoRequestStatus): Observable<PctoRequest> {
    return this.http.patch<PctoRequest>(
      `${this.baseUrl}/pcto/${id}/status`,
      { status },
      this.requestOptions(),
    );
  }

  private requestOptions(): { withCredentials: true; headers?: HttpHeaders } {
    const token = this.auth.token();
    const options: { withCredentials: true; headers?: HttpHeaders } = { withCredentials: true };

    if (token) {
      options.headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    }

    return options;
  }
}
