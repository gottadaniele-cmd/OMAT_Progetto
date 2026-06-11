import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { startWith } from 'rxjs';
import { ChiSiamoComponent } from '../chi-siamo/chi-siamo.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { OmatApiService } from '../../core/api/omat-api.service';
import { AuthStateService } from '../../core/auth/auth-state.service';

@Component({
  selector: 'app-pcto',
  standalone: true,
  imports: [ReactiveFormsModule, ChiSiamoComponent, SidebarComponent, StatusBadgeComponent],
  templateUrl: './pcto.component.html',
  styleUrl: './pcto.component.css',
})
export class PctoComponent implements OnInit {
  private readonly formBuilder = new FormBuilder();
  private readonly api = inject(OmatApiService);
  private readonly auth = inject(AuthStateService);

  protected readonly submitted = signal(false);
  protected readonly requestSent = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly submitError = signal('');
  protected readonly profileError = signal('');

  protected readonly savedMail = computed(() => this.pctoForm.controls.email.value || this.auth.user()?.email || '');
  protected readonly requestStatus = computed(() => {
    if (this.isSubmitting()) {
      return 'submitting';
    }

    return this.requestSent() ? 'sent' : 'draft';
  });

  protected readonly requestStatusTitle = computed(() => {
    if (this.isSubmitting()) {
      return 'Invio in corso';
    }

    return this.requestSent() ? 'Richiesta inviata' : 'Richiesta in bozza';
  });

  protected readonly pctoForm = this.formBuilder.nonNullable.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    city: ['', Validators.required],
    postalCode: ['', [Validators.required, Validators.pattern(/^[0-9]{5}$/)]],
    school: ['', Validators.required],
    classYear: ['', Validators.required],
    studyProgram: ['', Validators.required],
    startDate: ['', Validators.required],
    endDate: ['', Validators.required],
    motivation: ['', Validators.required],
  });

  private readonly pctoFormValue = toSignal(
    this.pctoForm.valueChanges.pipe(startWith(this.pctoForm.getRawValue())),
    { initialValue: this.pctoForm.getRawValue() },
  );

  protected readonly summary = computed(() => {
    const value = this.pctoFormValue();

    return {
      student:
        value.firstName || value.lastName
          ? `${value.firstName} ${value.lastName}`.trim()
          : 'Studente non indicato',
      school: value.school || 'Scuola da indicare',
      classYear: value.classYear ? `${value.classYear}ª` : 'Classe da indicare',
      studyProgram: value.studyProgram || 'Indirizzo da indicare',
      period:
        value.startDate && value.endDate
          ? `${this.formatDate(value.startDate)} - ${this.formatDate(value.endDate)}`
          : 'Periodo da indicare',
    };
  });

  ngOnInit(): void {
    this.pctoForm.valueChanges.subscribe(() => {
      if (this.requestSent() && !this.isSubmitting()) {
        this.requestSent.set(false);
      }
    });

    const storedUser = this.auth.user();

    if (storedUser?.role === 'studente') {
      const [firstName, ...lastNameParts] = storedUser.name.split(' ');
      this.pctoForm.patchValue({
        firstName: storedUser.firstName ?? firstName ?? '',
        lastName: storedUser.lastName ?? lastNameParts.join(' '),
        email: storedUser.email,
        city: storedUser.city ?? '',
        postalCode: storedUser.postalCode ?? '',
      });
    }

    this.api.getCurrentUser().subscribe({
      next: (user) => {
        if (user.role !== 'studente') {
          return;
        }

        this.pctoForm.patchValue({
          firstName: user.firstName ?? this.pctoForm.controls.firstName.value,
          lastName: user.lastName ?? this.pctoForm.controls.lastName.value,
          email: user.email,
          city: user.city ?? '',
          postalCode: user.postalCode ?? '',
        });
      },
      error: (error) => {
        console.error(error);
        if (this.pctoForm.controls.city.value && this.pctoForm.controls.postalCode.value) {
          return;
        }

        this.profileError.set('Sessione non aggiornata: rifai il login per caricare automaticamente citta e CAP.');
      },
    });
  }

  protected submitPctoRequest(): void {
    this.submitted.set(true);
    this.requestSent.set(false);
    this.isSubmitting.set(false);
    this.submitError.set('');

    if (this.pctoForm.invalid || !this.hasValidDateRange()) {
      this.pctoForm.markAllAsTouched();
      this.submitError.set(this.getPctoFormError());
      return;
    }

    this.isSubmitting.set(true);

    const payload = {
      ...this.pctoForm.getRawValue(),
      email: this.pctoForm.getRawValue().email,
    };

    this.api.createPctoRequest(payload).subscribe({
      next: () => {
        this.requestSent.set(true);
        this.submitted.set(false);
        this.isSubmitting.set(false);
      },
      error: (error) => {
        console.error(error);
        this.isSubmitting.set(false);
        this.submitError.set('Impossibile inviare la richiesta PCTO. Riprova tra poco.');
      },
    });
  }

  protected hasValidDateRange(): boolean {
    const { startDate, endDate } = this.pctoForm.getRawValue();

    if (!startDate || !endDate) {
      return false;
    }

    return new Date(startDate) <= new Date(endDate);
  }

  private formatDate(value: string): string {
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  }

  private getPctoFormError(): string {
    if (!this.hasValidDateRange()) {
      return 'Controlla il periodo: la data fine deve essere successiva o uguale alla data inizio.';
    }

    const fieldLabels: Record<string, string> = {
      firstName: 'Nome',
      lastName: 'Cognome',
      email: 'Email',
      city: 'Citta',
      postalCode: 'CAP',
      school: 'Scuola',
      classYear: 'Classe',
      studyProgram: 'Indirizzo',
      startDate: 'Data inizio',
      endDate: 'Data fine',
      motivation: 'Motivazione',
    };

    const invalidFields = Object.entries(this.pctoForm.controls)
      .filter(([, control]) => control.invalid)
      .map(([fieldName]) => fieldLabels[fieldName] ?? fieldName);

    return invalidFields.length
      ? `Controlla questi campi: ${invalidFields.join(', ')}.`
      : 'Controlla i dati inseriti prima di inviare la richiesta PCTO.';
  }
}
