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

  protected readonly carouselImages = [
    {
      src: 'assets/images/carousel-omat-insegna.jpeg',
      alt: 'Insegna OMAT',
    },
    {
      src: 'assets/images/carousel-omat-esterno-1.jpeg',
      alt: 'Esterno officina OMAT',
    },
    {
      src: 'assets/images/carousel-omat-esterno-2.jpeg',
      alt: 'Facciata officina OMAT',
    },
    {
      src: 'assets/images/carousel-omat-ingresso-1.jpeg',
      alt: 'Ingresso officina OMAT tra gli alberi',
    },
    {
      src: 'assets/images/carousel-omat-ingresso-2.jpeg',
      alt: 'Cancello e ingresso OMAT',
    },
  ] as const;

  protected readonly carouselIndex = signal(0);
  protected readonly currentCarouselImage = computed(
    () => this.carouselImages[this.carouselIndex()] ?? this.carouselImages[0],
  );
  protected readonly canRequestOrder = computed(() => this.auth.role() === 'azienda');
  protected readonly canBookPcto = computed(() => this.auth.role() === 'studente');
  protected readonly canOpenAdmin = computed(() => this.auth.role() === 'admin');

  protected previousImage(): void {
    this.carouselIndex.update((index) =>
      index === 0 ? this.carouselImages.length - 1 : index - 1,
    );
  }

  protected nextImage(): void {
    this.carouselIndex.update((index) =>
      index === this.carouselImages.length - 1 ? 0 : index + 1,
    );
  }

  protected selectImage(index: number): void {
    this.carouselIndex.set(index);
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
