const API_URL = window.location.origin;


function getAuthHeaders() {

    const token = localStorage.getItem("access_token");

    return token
        ? {
            "Authorization": `Bearer ${token}`
        }
        : {};
}


async function loadCurrentUser() {

    try {

        const response = await fetch(
            `${API_URL}/api/me`,
            {
                headers: getAuthHeaders()
            }
        );

        if (!response.ok) {
            return;
        }

        const data = await response.json();

        const userInfo =
            document.getElementById("currentUser");

        if (userInfo) {
            userInfo.textContent =
                `Logged in as: ${data.username} (${data.role})`;
        }

    } catch (error) {

        console.error(
            "Failed to load current user:",
            error
        );

    }
}


async function loadUsers() {

    const tableBody =
        document.getElementById("usersTableBody");

    if (!tableBody) {
        return;
    }

    try {

        const response = await fetch(
            `${API_URL}/api/admin/users`,
            {
                headers: getAuthHeaders()
            }
        );

        if (response.status === 401) {

            localStorage.removeItem("access_token");

            window.location.href = "index.html";

            return;
        }

        if (response.status === 403) {

            tableBody.innerHTML = `
                <tr>
                    <td colspan="5">
                        Access denied. Admin privileges required.
                    </td>
                </tr>
            `;

            return;
        }

        if (!response.ok) {

            throw new Error(
                "Failed to load users."
            );

        }

        const data =
            await response.json();

        tableBody.innerHTML = "";

        data.users.forEach(user => {

            const row =
                document.createElement("tr");

            row.innerHTML = `
                <td>
                    ${user.id}
                </td>

                <td>
                    ${user.username}
                </td>

                <td>
                    <select id="role-${user.id}">

                        <option
                            value="analyst"
                            ${user.role === "analyst" ? "selected" : ""}
                        >
                            Analyst
                        </option>

                        <option
                            value="manager"
                            ${user.role === "manager" ? "selected" : ""}
                        >
                            Manager
                        </option>

                        <option
                            value="admin"
                            ${user.role === "admin" ? "selected" : ""}
                        >
                            Admin
                        </option>

                    </select>
                </td>

                <td>
                    ${user.created_at}
                </td>

                <td>

                    <button
                        onclick="updateRole(${user.id})"
                    >
                        Save
                    </button>

                </td>
            `;

            tableBody.appendChild(row);

        });

    } catch (error) {

        console.error(
            "Failed to load users:",
            error
        );

        tableBody.innerHTML = `
            <tr>
                <td colspan="5">
                    Failed to load users.
                </td>
            </tr>
        `;
    }
}


async function updateRole(userId) {

    const roleSelect =
        document.getElementById(
            `role-${userId}`
        );

    if (!roleSelect) {
        return;
    }

    const role =
        roleSelect.value;

    try {

        const response = await fetch(
            `${API_URL}/api/admin/users/${userId}/role?role=${encodeURIComponent(role)}`,
            {
                method: "PUT",

                headers: getAuthHeaders()
            }
        );

        if (response.status === 401) {

            localStorage.removeItem("access_token");

            window.location.href = "index.html";

            return;
        }

        if (response.status === 403) {

            alert(
                "You do not have permission to change roles."
            );

            return;
        }

        if (!response.ok) {

            const error =
                await response.json();

            alert(
                error.detail ||
                "Failed to update role."
            );

            return;
        }

        alert(
            "Role updated successfully."
        );

        await loadUsers();

    } catch (error) {

        console.error(
            "Failed to update role:",
            error
        );

        alert(
            "Could not connect to the server."
        );
    }
}


loadCurrentUser();
loadUsers();