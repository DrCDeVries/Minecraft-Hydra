$(function () {

    var ajaxErrorHandler = function (jqXHR, textStatus, errorThrown) {
        var error = errorThrown;
        if (jqXHR.responseJSON && jqXHR.responseJSON.msg) {
            error = jqXHR.responseJSON.msg;
        }
        $(".loginError").text(error).show();
    }

    $(".loginError").text('').hide();
    
   var loginMicrosoftEndPoint = "/login/microsoft";

    $('.btnLoginMicrosoft').on("click", function (evt) {
        
        var myWindow = window.open(MyPath,"login","toolbar=no,status=no,menubar=no,location=center,scrollbars=no,resizable=no,height=500,width=657");
        $.post({ url: loginMicrosoftEndPoint, data:{loginType:"Microsoft"}}).then(
            function (data) {
                console.log(data);
                myWindow.location = data.url;
            },
            function (jqXHR, textStatus, errorThrown) {
                var error = errorThrown;
                if (jqXHR.responseJSON && jqXHR.responseJSON.msg) {
                    error = jqXHR.responseJSON.msg;                    
                }
                $(".loginError").text(error).show();
            }
        )
    })

    var loginMojangEndPoint = "/login/mojang";
    $('.btnLoginMojang').on("click", function (evt) {
        $(".loginError").text('').hide();
        var data = { username: $("#mojang_login_username").val(), password: $("#mojang_login_password").val() };
        if (data.username === '') {
            $(".loginError").text('Username is required').show();
            return;
        }
        if (data.password === '') {
            $(".loginError").text('Passsword is required').show();
            return;
        }
        $.post({ url: loginMojangEndPoint, data }).then(
            function (data) {

            },
            function (jqXHR, textStatus, errorThrown) {
                var error = errorThrown;
                if (jqXHR.responseJSON && jqXHR.responseJSON.msg) {
                    error = jqXHR.responseJSON.msg;                    
                }
                $(".loginError").text(error).show();
            }
        )
    })

})