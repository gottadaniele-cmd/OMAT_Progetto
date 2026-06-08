import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { OmatApiService } from '../../core/api/omat-api.service';
import { AuthStateService } from '../../core/auth/auth-state.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent {
  private readonly router = inject(Router);
  private readonly formBuilder = new FormBuilder();
  private readonly api = inject(OmatApiService);
  private readonly auth = inject(AuthStateService);

  protected readonly loginError = signal('');

  protected readonly loginForm = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected submitLogin(): void {
    this.loginError.set('');

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const { email, password } = this.loginForm.getRawValue();

    this.api.login(email, password).subscribe({
      next: ({ token, user }) => {
        this.auth.setUser(user, token);

        if (user.role === 'admin') {
          this.router.navigate(['/admin']);
          return;
        }

        if (user.role === 'studente') {
          this.router.navigate(['/pcto']);
          return;
        }

        this.router.navigate(['/richieste-ordini']);
      },
      error: (error) => {
        console.error(error);
        this.loginError.set('Credenziali non valide o server non raggiungibile.');
      },
    });
  }

}
