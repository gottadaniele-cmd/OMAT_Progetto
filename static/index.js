'use strict'

$(document).ready(function () {
    const btnLogin = document.querySelector('#btnLogin')
    const btnLogout = document.querySelector('#btnLogout')
    btnLogout.style.display = 'none'
    let h3

    btnLogin.addEventListener('click', () => {
        btnLogin.style.display = 'none'
        h3 = document.createElement('h3')
        h3.innerHTML = 'Benvenuto Utente'
        h3.style.height = '20px'
        h3.style.marginBottom = '24px'
        buttons.prepend(h3)
        btnLogout.style.display = 'block'
    })
    btnLogout.addEventListener('click', () => {
        btnLogout.style.display = 'none'
        btnLogin.style.display = 'block'
        h3.style.display = 'none'
    })

    const modal = document.querySelector('#loginModal');

    btnLogin.addEventListener('click', () => {
        modal.style.display = 'flex';
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

});