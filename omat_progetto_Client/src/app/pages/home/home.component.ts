import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ChiSiamoComponent } from "../chi-siamo/chi-siamo.component";
import { SidebarComponent } from "../sidebar/sidebar.component";
import { AuthStateService } from '../../core/auth/auth-state.service';

@Component({
  selector: 'app-home',
  imports: [ChiSiamoComponent, SidebarComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStateService);

  protected readonly showcaseItems = [
    {
      id: 'officina',
      label: 'Officina',
      title: 'Uno sguardo dentro OMAT',
      description: 'La sede OMAT vista dall esterno.',
      imageUrl: 'assets/images/officina-omat.png',
    },
    {
      id: 'pezzi-singoli',
      label: 'Pezzi singoli',
      title: 'Componenti realizzati su disegno',
      description: 'Qui puoi mostrare un pezzo finito, un prototipo o un dettaglio tecnico.',
      imageUrl: '',
    },
    {
      id: 'piccole-serie',
      label: 'Piccole serie',
      title: 'Lotti contenuti, precisione ripetibile',
      description: 'Spazio ideale per foto di componenti ordinati, controllati e pronti alla consegna.',
      imageUrl: '',
    },
    {
      id: 'manutenzione',
      label: 'Manutenzione',
      title: 'Attrezzature seguite nel tempo',
      description: 'Mostra interventi, strumenti, ripristini o adattamenti realizzati in officina.',
      imageUrl: '',
    },
  ] as const;

  protected readonly selectedShowcaseId = signal<(typeof this.showcaseItems)[number]['id']>('officina');
  protected readonly selectedShowcase = computed(
    () =>
      this.showcaseItems.find((item) => item.id === this.selectedShowcaseId()) ??
      this.showcaseItems[0],
  );
  protected readonly canRequestOrder = computed(() => this.auth.role() === 'azienda');
  protected readonly canBookPcto = computed(() => this.auth.role() === 'studente');
  protected readonly canOpenAdmin = computed(() => this.auth.role() === 'admin');

  protected selectShowcase(itemId: (typeof this.showcaseItems)[number]['id']): void {
    this.selectedShowcaseId.set(itemId);
  }

  protected goToOrdini(): void {
    this.router.navigate([this.canRequestOrder() ? '/richieste-ordini' : '/login']);
  }

  protected goToPCTO(): void {
    this.router.navigate([this.canBookPcto() ? '/pcto' : '/login']);
  }

  protected goToAdmin(): void {
    this.router.navigate(['/admin']);
  }

  protected goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
