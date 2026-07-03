import { Injectable } from '@angular/core';
import * as CryptoJS from 'crypto-js';

@Injectable({
  providedIn: 'root'
})
export class LocalStorageService {

  private key: string = "96d766847aa63de1810519cc2ea8a9c24f97f0cacd53d4153f4f8365a8980baa";

  public saveData(key: string, value: string) {
    localStorage.setItem(key, this.encrypt(value));
  }

  public getData(key: string) {
    let data = localStorage.getItem(key) || "";
    if (!data) return "";
    try {
      return this.decrypt(data);
    } catch {
      // Corrupted/stale value that no longer decrypts with the current key — drop it
      // instead of crashing every service that reads it (AuthService reads this at boot).
      localStorage.removeItem(key);
      return "";
    }
  }

  public removeData(key: string) {
    localStorage.removeItem(key);
  }

  public clearData() {
    localStorage.clear();
  }

  private encrypt(txt: string): string {
    return CryptoJS.AES.encrypt(txt, this.key).toString();
  }

  private decrypt(txtToDecrypt: string) {
    return CryptoJS.AES.decrypt(txtToDecrypt, this.key).toString(CryptoJS.enc.Utf8);
  }
}
