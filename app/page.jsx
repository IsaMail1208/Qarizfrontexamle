"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";

import { auth } from "../lib/firebase";

const emptyForm = {
  full_name: "",
  birth_date: "",
  passport_data: "",
  damage_amount: "",
  description: ""
};

export default function HomePage() {
  const [form, setForm] = useState(emptyForm);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [cases, setCases] = useState([]);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingCases, setLoadingCases] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [user, setUser] = useState(null);

  const apiUrl = "";

  const isAuthenticated = useMemo(() => Boolean(user), [user]);

  async function loadCases({ reset = false } = {}) {
    setLoadingCases(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "12");
      if (search.trim()) {
        params.set("q", search.trim());
      }
      if (!search.trim() && !reset && nextCursor) {
        params.set("cursor", nextCursor);
      }

      const res = await fetch(`${apiUrl}/cases?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Не удалось загрузить список");
      }
      const data = await res.json();
      setCases((prev) => (reset ? data.items : [...prev, ...data.items]));
      setNextCursor(data.next_cursor || null);
    } catch (err) {
      setStatus(err.message || "Не удалось загрузить список");
    } finally {
      setLoadingCases(false);
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      loadCases({ reset: true });
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    const timeout = setTimeout(() => {
      setNextCursor(null);
      loadCases({ reset: true });
    }, 400);

    return () => clearTimeout(timeout);
  }, [search, isAuthenticated]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function updatePhoto(event) {
    const file = event.target.files?.[0] || null;
    setPhoto(file);
  }

  function clearPhoto() {
    setPhoto(null);
    setPhotoPreview("");
  }

  useEffect(() => {
    if (!photo) {
      setPhotoPreview("");
      return;
    }

    const objectUrl = URL.createObjectURL(photo);
    setPhotoPreview(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!user?.email) {
      setStatus("Не удалось определить email пользователя");
      return;
    }
    setStatus("Сохранение...");

    const formData = new FormData();
    formData.append("full_name", form.full_name);
    formData.append("birth_date", form.birth_date);
    formData.append("passport_data", form.passport_data);
    formData.append("damage_amount", form.damage_amount === "" ? "0" : form.damage_amount);
    formData.append("submitted_by", user.email);
    formData.append("description", form.description);
    if (photo) {
      formData.append("photo", photo);
    }

    try {
      const res = await fetch(`${apiUrl}/cases`, {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || "Не удалось сохранить");
      }

      setForm(emptyForm);
      setPhoto(null);
      setPhotoPreview("");
      setStatus("Сохранено");
      await loadCases({ reset: true });
    } catch (err) {
      setStatus(err.message || "Не удалось сохранить");
    }
  }


  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthStatus("Подождите...");

    try {
      if (authMode === "register") {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
      setAuthStatus("");
    } catch (err) {
      setAuthStatus(err.message || "Ошибка авторизации");
    }
  }

  async function handleSignOut() {
    await signOut(auth);
  }

  if (!isAuthenticated) {
    return (
      <main className="main auth-screen">
        <header className="header header-bar">
          <div>
            <h1>Qariz</h1>
            <p>Реестр мошенников</p>
          </div>
        </header>
        <section className="panel auth-panel">
          <h2>{authMode === "register" ? "Регистрация" : "Вход"}</h2>
          <form className="form" onSubmit={handleAuthSubmit}>
            <label>
              Email
              <input
                name="email"
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Пароль
              <input
                name="password"
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                required
              />
            </label>
            <button type="submit">
              {authMode === "register" ? "Создать аккаунт" : "Войти"}
            </button>
          </form>
          {authStatus ? <p className="status">{authStatus}</p> : null}
          <button
            type="button"
            className="ghost"
            onClick={() => setAuthMode(authMode === "register" ? "login" : "register")}
          >
            {authMode === "register" ? "У меня уже есть аккаунт" : "Создать аккаунт"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="main">
      <header className="header header-bar">
        <div>
          <h1>Qariz</h1>
          <p>Реестр мошенников</p>
        </div>
        <div className="account-chip">
          <div>
            <span className="account-title">Аккаунт</span>
            <span className="account-email">{user?.email}</span>
          </div>
          <button type="button" className="ghost tiny" onClick={handleSignOut}>
            Выйти
          </button>
        </div>
      </header>
      <section className="panel">
        <h2>Новая запись</h2>
        <form className="form form-horizontal" onSubmit={handleSubmit}>
          <label>
            ФИО
            <input name="full_name" value={form.full_name} onChange={updateField} required />
          </label>
          <label>
            Дата рождения
            <input name="birth_date" type="date" value={form.birth_date} onChange={updateField} required />
          </label>
          <label>
            Паспортные данные
            <input name="passport_data" value={form.passport_data} onChange={updateField} required />
          </label>
          <label>
            Сумма ущерба
            <input name="damage_amount" type="number" value={form.damage_amount} onChange={updateField} min="0" step="0.01" required />
          </label>
          <div className="note span-2">
            Кто внес: <strong>{user?.email}</strong>
          </div>
          <label className="span-2">
            Описание
            <textarea name="description" value={form.description} onChange={updateField} required rows="4" />
          </label>
          <label className="span-2">
            Фото
            <input name="photo" type="file" accept="image/*" onChange={updatePhoto} />
          </label>
          {photoPreview ? (
            <div className="photo-preview span-2">
              <img src={photoPreview} alt="Предпросмотр" />
              <button type="button" className="ghost" onClick={clearPhoto}>
                Удалить фото
              </button>
            </div>
          ) : null}
          <button type="submit" className="span-2">
            Сохранить
          </button>
        </form>
        {status ? <p className="status">{status}</p> : null}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Записи</h2>
          <div className="search">
            <input
              type="search"
              placeholder="Поиск по ФИО или паспорту"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        <div className="cases">
          {cases.map((item) => (
            <article className="case-card" key={item.id}>
              <header>
                <h3>{item.full_name}</h3>
                <p>Сумма ущерба: {item.damage_amount}</p>
              </header>
              <p>{item.description}</p>
              <p>
                Паспорт: {item.passport_data}
              </p>
              <p>
                Внес: {item.submitted_by} — {new Date(item.submitted_at).toLocaleString("ru-RU")}
              </p>
              <p>Дата рождения: {new Date(item.birth_date).toLocaleDateString("ru-RU")}</p>
              {item.photo_url ? (
                <div className="photo">
                  <img src={item.photo_url} alt={`Фото ${item.full_name}`} loading="lazy" />
                </div>
              ) : null}
            </article>
          ))}
          {cases.length === 0 ? <p>Записей пока нет.</p> : null}
        </div>
        <div className="pagination">
          {nextCursor && !search.trim() ? (
            <button type="button" className="ghost" onClick={() => loadCases()} disabled={loadingCases}>
              {loadingCases ? "Загрузка..." : "Показать еще"}
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
