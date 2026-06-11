import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ChiSiamoComponent } from '../chi-siamo/chi-siamo.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { OmatApiService } from '../../core/api/omat-api.service';
import { PctoRequest, PctoRequestStatus } from '../../core/models/pcto-request.model';

@Component({
  selector: 'app-pcto-detail',
  standalone: true,
  imports: [RouterLink, ChiSiamoComponent, SidebarComponent, StatusBadgeComponent],
  templateUrl: './pcto-detail.component.html',
  styleUrl: './pcto-detail.component.css',
})
export class PctoDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(OmatApiService);
  private readonly requestId = this.route.snapshot.paramMap.get('id');

  protected readonly request = signal<PctoRequest | undefined>(undefined);
  protected readonly statusMessage = signal('');
  protected readonly actionError = signal('');
  protected readonly isUpdating = signal(false);

  ngOnInit(): void {
    if (!this.requestId) {
      return;
    }

    this.api.getPctoRequest(this.requestId).subscribe({
      next: (request) => this.request.set(request),
      error: (error) => console.error(error),
    });
  }

  protected updateStatus(status: PctoRequestStatus): void {
    const currentRequest = this.request();

    if (!currentRequest || this.isUpdating()) {
      return;
    }

    this.isUpdating.set(true);
    this.statusMessage.set('');
    this.actionError.set('');

    this.api.updatePctoStatus(currentRequest.id, status).subscribe({
      next: (request) => {
        this.request.set(request);
        this.statusMessage.set('Stato richiesta PCTO aggiornato correttamente.');
        this.isUpdating.set(false);
      },
      error: (error) => {
        console.error(error);
        this.actionError.set('Impossibile aggiornare lo stato della richiesta PCTO.');
        this.isUpdating.set(false);
      },
    });
  }

  protected contactStudent(request: PctoRequest): void {
    if (!request.email) {
      this.actionError.set('Email studente non disponibile per questa richiesta.');
      return;
    }

    const subject = encodeURIComponent('Richiesta PCTO OMAT');
    const body = encodeURIComponent(
      [
        `Ciao ${request.studentName},`,
        '',
        'ti contattiamo in merito alla tua richiesta PCTO presso OMAT.',
        '',
        `Periodo richiesto: ${this.formatDate(request.startDate)} - ${this.formatDate(request.endDate)}`,
        `Scuola: ${request.school}`,
        '',
        'Cordiali saluti,',
        'OMAT s.n.c.',
      ].join('\n'),
    );

    window.location.href = `mailto:${request.email}?subject=${subject}&body=${body}`;
  }

  protected formatDate(value: string): string {
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  }
}
